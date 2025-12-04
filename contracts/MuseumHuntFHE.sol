// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MuseumHuntFHE is SepoliaConfig {
    struct EncryptedVisitorProfile {
        uint256 visitorId;
        euint32 encryptedAge;          // Encrypted visitor age
        euint32 encryptedInterest1;    // Encrypted primary interest
        euint32 encryptedInterest2;    // Encrypted secondary interest
        uint256 timestamp;
    }
    
    struct ScavengerHunt {
        string[] exhibitRoute;
        string[] educationalContent;
        string difficultyLevel;
        bool isGenerated;
    }

    uint256 public visitorCount;
    mapping(uint256 => EncryptedVisitorProfile) public visitorProfiles;
    mapping(uint256 => ScavengerHunt) public scavengerHunts;
    
    mapping(string => euint32) private encryptedRouteCount;
    string[] private routeTypeList;
    
    mapping(uint256 => uint256) private requestToVisitorId;
    mapping(address => bool) private authorizedMuseums;
    
    event ProfileSubmitted(uint256 indexed visitorId, uint256 timestamp);
    event HuntRequested(uint256 indexed visitorId);
    event HuntGenerated(uint256 indexed visitorId);
    
    modifier onlyMuseum() {
        require(authorizedMuseums[msg.sender], "Unauthorized museum");
        _;
    }
    
    constructor() {
        authorizedMuseums[msg.sender] = true;
    }
    
    function authorizeMuseum(address museum) public onlyMuseum {
        authorizedMuseums[museum] = true;
    }
    
    function submitEncryptedProfile(
        euint32 encryptedAge,
        euint32 encryptedInterest1,
        euint32 encryptedInterest2
    ) public {
        visitorCount += 1;
        uint256 newId = visitorCount;
        
        visitorProfiles[newId] = EncryptedVisitorProfile({
            visitorId: newId,
            encryptedAge: encryptedAge,
            encryptedInterest1: encryptedInterest1,
            encryptedInterest2: encryptedInterest2,
            timestamp: block.timestamp
        });
        
        scavengerHunts[newId] = ScavengerHunt({
            exhibitRoute: new string[](0),
            educationalContent: new string[](0),
            difficultyLevel: "",
            isGenerated: false
        });
        
        emit ProfileSubmitted(newId, block.timestamp);
    }
    
    function requestPersonalizedHunt(uint256 visitorId) public onlyMuseum {
        EncryptedVisitorProfile storage profile = visitorProfiles[visitorId];
        require(!scavengerHunts[visitorId].isGenerated, "Hunt already generated");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(profile.encryptedAge);
        ciphertexts[1] = FHE.toBytes32(profile.encryptedInterest1);
        ciphertexts[2] = FHE.toBytes32(profile.encryptedInterest2);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.generateHunt.selector);
        requestToVisitorId[reqId] = visitorId;
        
        emit HuntRequested(visitorId);
    }
    
    function generateHunt(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 visitorId = requestToVisitorId[requestId];
        require(visitorId != 0, "Invalid request");
        
        ScavengerHunt storage hunt = scavengerHunts[visitorId];
        require(!hunt.isGenerated, "Hunt already generated");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        uint32 age = results[0];
        uint32 interest1 = results[1];
        uint32 interest2 = results[2];
        
        hunt.exhibitRoute = generateExhibitRoute(age, interest1, interest2);
        hunt.educationalContent = generateEducationalContent(age, interest1);
        hunt.difficultyLevel = determineDifficultyLevel(age);
        hunt.isGenerated = true;
        
        if (FHE.isInitialized(encryptedRouteCount[hunt.difficultyLevel]) == false) {
            encryptedRouteCount[hunt.difficultyLevel] = FHE.asEuint32(0);
            routeTypeList.push(hunt.difficultyLevel);
        }
        encryptedRouteCount[hunt.difficultyLevel] = FHE.add(
            encryptedRouteCount[hunt.difficultyLevel], 
            FHE.asEuint32(1)
        );
        
        emit HuntGenerated(visitorId);
    }
    
    function getScavengerHunt(uint256 visitorId) public view returns (
        string[] memory exhibitRoute,
        string[] memory educationalContent,
        string memory difficultyLevel,
        bool isGenerated
    ) {
        ScavengerHunt storage sh = scavengerHunts[visitorId];
        return (sh.exhibitRoute, sh.educationalContent, sh.difficultyLevel, sh.isGenerated);
    }
    
    function getEncryptedRouteCount(string memory routeType) public view returns (euint32) {
        return encryptedRouteCount[routeType];
    }
    
    function requestRouteCountDecryption(string memory routeType) public onlyMuseum {
        euint32 count = encryptedRouteCount[routeType];
        require(FHE.isInitialized(count), "Route type not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRouteCount.selector);
        requestToVisitorId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(routeType)));
    }
    
    function decryptRouteCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public onlyMuseum {
        uint256 routeTypeHash = requestToVisitorId[requestId];
        string memory routeType = getRouteTypeFromHash(routeTypeHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        uint32 count = abi.decode(cleartexts, (uint32));
    }
    
    // Helper functions for hunt generation
    function generateExhibitRoute(uint32 age, uint32 interest1, uint32 interest2) private pure returns (string[] memory) {
        string[] memory route = new string[](5);
        
        if (age < 12) {
            route[0] = "ChildrensDiscoveryZone";
            route[1] = "InteractiveSciencePlay";
            route[2] = "StorytellingCorner";
            route[3] = "ArtStation";
            route[4] = "DinosaurReplica";
        } else {
            route[0] = getInterestBasedExhibit(interest1);
            route[1] = getInterestBasedExhibit(interest2);
            route[2] = "MainGallery";
            route[3] = "HistoricalArtifacts";
            route[4] = "TechnologyShowcase";
        }
        
        return route;
    }
    
    function getInterestBasedExhibit(uint32 interest) private pure returns (string memory) {
        if (interest == 1) return "AncientCivilizations";
        if (interest == 2) return "SpaceExploration";
        if (interest == 3) return "MarineBiology";
        if (interest == 4) return "ModernArt";
        return "MainHall";
    }
    
    function generateEducationalContent(uint32 age, uint32 interest) private pure returns (string[] memory) {
        string[] memory content = new string[](3);
        
        if (age < 8) {
            content[0] = "FunFact1";
            content[1] = "SimpleQuiz";
            content[2] = "InteractiveGame";
        } else if (age < 18) {
            if (interest == 1) {
                content[0] = "HistoricalTimeline";
                content[1] = "ArchaeologyPuzzle";
                content[2] = "CulturalComparison";
            } else {
                content[0] = "ScienceExperiment";
                content[1] = "TechnologyDemo";
                content[2] = "ArtAnalysis";
            }
        } else {
            content[0] = "InDepthAnalysis";
            content[1] = "ExpertInterview";
            content[2] = "ResearchPaper";
        }
        
        return content;
    }
    
    function determineDifficultyLevel(uint32 age) private pure returns (string memory) {
        if (age < 6) return "Easy";
        if (age < 12) return "Medium";
        if (age < 18) return "Advanced";
        return "Expert";
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getRouteTypeFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < routeTypeList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(routeTypeList[i]))) == hash) {
                return routeTypeList[i];
            }
        }
        revert("Route type not found");
    }
}