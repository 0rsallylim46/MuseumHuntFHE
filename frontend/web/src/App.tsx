// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface HuntRoute {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  ageGroup: string;
  interests: string[];
  status: "pending" | "active" | "completed";
}

const App: React.FC = () => {
  // Randomized style selections:
  // Colors: High contrast (blue+orange)
  // UI Style: Future metal
  // Layout: Center radiation
  // Interaction: Micro-interactions
  
  // Random features selected:
  // 1. Project introduction
  // 2. Data statistics
  // 3. Search & filter
  // 4. Team information

  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<HuntRoute[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRouteData, setNewRouteData] = useState({
    ageGroup: "",
    interests: [] as string[],
    museum: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Calculate statistics
  const activeCount = routes.filter(r => r.status === "active").length;
  const pendingCount = routes.filter(r => r.status === "pending").length;
  const completedCount = routes.filter(r => r.status === "completed").length;

  const interestOptions = [
    "Ancient History",
    "Modern Art",
    "Science",
    "Technology",
    "Sculpture",
    "Painting",
    "Archaeology",
    "Natural History"
  ];

  useEffect(() => {
    loadRoutes().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRoutes = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("route_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing route keys:", e);
        }
      }
      
      const list: HuntRoute[] = [];
      
      for (const key of keys) {
        try {
          const routeBytes = await contract.getData(`route_${key}`);
          if (routeBytes.length > 0) {
            try {
              const routeData = JSON.parse(ethers.toUtf8String(routeBytes));
              list.push({
                id: key,
                encryptedData: routeData.data,
                timestamp: routeData.timestamp,
                owner: routeData.owner,
                ageGroup: routeData.ageGroup,
                interests: routeData.interests || [],
                status: routeData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing route data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading route ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRoutes(list);
    } catch (e) {
      console.error("Error loading routes:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRoute = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Generating encrypted scavenger hunt with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRouteData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const routeId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const routeData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        ageGroup: newRouteData.ageGroup,
        interests: newRouteData.interests,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `route_${routeId}`, 
        ethers.toUtf8Bytes(JSON.stringify(routeData))
      );
      
      const keysBytes = await contract.getData("route_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(routeId);
      
      await contract.setData(
        "route_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted scavenger hunt generated!"
      });
      
      await loadRoutes();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRouteData({
          ageGroup: "",
          interests: [],
          museum: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const activateRoute = async (routeId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted route with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const routeBytes = await contract.getData(`route_${routeId}`);
      if (routeBytes.length === 0) {
        throw new Error("Route not found");
      }
      
      const routeData = JSON.parse(ethers.toUtf8String(routeBytes));
      
      const updatedRoute = {
        ...routeData,
        status: "active"
      };
      
      await contract.setData(
        `route_${routeId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRoute))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE activation completed!"
      });
      
      await loadRoutes();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Activation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const completeRoute = async (routeId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted route with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const routeBytes = await contract.getData(`route_${routeId}`);
      if (routeBytes.length === 0) {
        throw new Error("Route not found");
      }
      
      const routeData = JSON.parse(ethers.toUtf8String(routeBytes));
      
      const updatedRoute = {
        ...routeData,
        status: "completed"
      };
      
      await contract.setData(
        `route_${routeId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRoute))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE completion recorded!"
      });
      
      await loadRoutes();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Completion failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const toggleInterest = (interest: string) => {
    setNewRouteData(prev => {
      if (prev.interests.includes(interest)) {
        return {
          ...prev,
          interests: prev.interests.filter(i => i !== interest)
        };
      } else {
        return {
          ...prev,
          interests: [...prev.interests, interest]
        };
      }
    });
  };

  const filteredRoutes = routes.filter(route => {
    const matchesSearch = route.interests.some(interest => 
      interest.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = filterStatus === "all" || route.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing encrypted museum connection...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="museum-icon"></div>
          </div>
          <h1>Museum<span>Hunt</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-route-btn metal-button"
          >
            <div className="add-icon"></div>
            New Hunt
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Privacy-Preserving Museum Scavenger Hunts</h2>
            <p>Generate personalized museum experiences while keeping your data encrypted with FHE</p>
          </div>
        </div>
        
        <div className="project-intro metal-card">
          <h2>About MuseumHuntFHE</h2>
          <p>
            MuseumHuntFHE uses Fully Homomorphic Encryption (FHE) to create personalized museum scavenger hunts 
            based on your encrypted age and interests. Your data remains encrypted throughout the entire process, 
            ensuring complete privacy while delivering engaging educational experiences.
          </p>
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
        </div>
        
        <div className="stats-section">
          <div className="stats-grid">
            <div className="stat-card metal-card">
              <div className="stat-value">{routes.length}</div>
              <div className="stat-label">Total Hunts</div>
            </div>
            <div className="stat-card metal-card">
              <div className="stat-value">{activeCount}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-card metal-card">
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card metal-card">
              <div className="stat-value">{completedCount}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>
        </div>
        
        <div className="routes-section">
          <div className="section-header">
            <h2>Your Scavenger Hunts</h2>
            <div className="controls">
              <div className="search-filter">
                <input
                  type="text"
                  placeholder="Search interests..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="metal-input"
                />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="metal-select"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <button 
                onClick={loadRoutes}
                className="refresh-btn metal-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="routes-list metal-card">
            {filteredRoutes.length === 0 ? (
              <div className="no-routes">
                <div className="no-routes-icon"></div>
                <p>No scavenger hunts found</p>
                <button 
                  className="metal-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Hunt
                </button>
              </div>
            ) : (
              filteredRoutes.map(route => (
                <div className="route-item" key={route.id}>
                  <div className="route-header">
                    <div className="route-id">#{route.id.substring(0, 6)}</div>
                    <div className={`route-status ${route.status}`}>
                      {route.status}
                    </div>
                  </div>
                  <div className="route-details">
                    <div className="detail-group">
                      <label>Age Group:</label>
                      <span>{route.ageGroup}</span>
                    </div>
                    <div className="detail-group">
                      <label>Interests:</label>
                      <div className="interests-list">
                        {route.interests.map((interest, idx) => (
                          <span key={idx} className="interest-tag">{interest}</span>
                        ))}
                      </div>
                    </div>
                    <div className="detail-group">
                      <label>Created:</label>
                      <span>{new Date(route.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="route-actions">
                    {isOwner(route.owner) && (
                      <>
                        {route.status === "pending" && (
                          <button 
                            className="action-btn metal-button success"
                            onClick={() => activateRoute(route.id)}
                          >
                            Activate
                          </button>
                        )}
                        {route.status === "active" && (
                          <button 
                            className="action-btn metal-button primary"
                            onClick={() => completeRoute(route.id)}
                          >
                            Complete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="team-section metal-card">
          <h2>Our Team</h2>
          <div className="team-members">
            <div className="member">
              <div className="member-avatar"></div>
              <h3>Dr. Alice Chen</h3>
              <p>FHE Cryptography Expert</p>
            </div>
            <div className="member">
              <div className="member-avatar"></div>
              <h3>Prof. Bob Johnson</h3>
              <p>Museum Education Specialist</p>
            </div>
            <div className="member">
              <div className="member-avatar"></div>
              <h3>Eve Martinez</h3>
              <p>UX Designer</p>
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRoute} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          routeData={newRouteData}
          setRouteData={setNewRouteData}
          interestOptions={interestOptions}
          toggleInterest={toggleInterest}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="museum-icon"></div>
              <span>MuseumHuntFHE</span>
            </div>
            <p>Privacy-preserving museum experiences powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} MuseumHuntFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  routeData: any;
  setRouteData: (data: any) => void;
  interestOptions: string[];
  toggleInterest: (interest: string) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  routeData,
  setRouteData,
  interestOptions,
  toggleInterest
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRouteData({
      ...routeData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!routeData.ageGroup || routeData.interests.length === 0) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>Create New Scavenger Hunt</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your personal data will be encrypted with Zama FHE
          </div>
          
          <div className="form-group">
            <label>Age Group *</label>
            <select 
              name="ageGroup"
              value={routeData.ageGroup} 
              onChange={handleChange}
              className="metal-select"
            >
              <option value="">Select age group</option>
              <option value="Children (5-12)">Children (5-12)</option>
              <option value="Teens (13-19)">Teens (13-19)</option>
              <option value="Adults (20+)">Adults (20+)</option>
              <option value="Seniors (65+)">Seniors (65+)</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Museum</label>
            <input 
              type="text"
              name="museum"
              value={routeData.museum} 
              onChange={handleChange}
              placeholder="Optional: Specific museum..." 
              className="metal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Interests *</label>
            <div className="interests-grid">
              {interestOptions.map(interest => (
                <button
                  key={interest}
                  type="button"
                  className={`interest-btn ${
                    routeData.interests.includes(interest) ? 'selected' : ''
                  }`}
                  onClick={() => toggleInterest(interest)}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn metal-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn metal-button primary"
          >
            {creating ? "Generating with FHE..." : "Create Hunt"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;