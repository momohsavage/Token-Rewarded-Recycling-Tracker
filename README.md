# ♻️ Token-Rewarded Recycling Tracker

Welcome to an innovative Web3 solution for boosting recycling efforts! This app incentivizes consumers to recycle by rewarding them with tokens, while providing transparent tracking of recyclable materials from drop-off to processing on the Stacks blockchain. Built with Clarity smart contracts, it addresses real-world environmental challenges like waste management, supply chain opacity, and low recycling participation rates by creating a verifiable, reward-driven ecosystem.

## ✨ Features

🔄 Track materials end-to-end: From consumer deposit to processor confirmation, with immutable blockchain records.  
💰 Earn rewards: Consumers and collectors receive tokens for verified recycling actions.  
📊 Transparent supply chain: Anyone can verify the journey of materials to ensure ethical processing.  
🛡️ Role-based access: Separate permissions for consumers, collectors, and processors.  
🏆 Token economy: Utility tokens that can be staked, redeemed, or used for governance.  
🔒 Fraud prevention: Oracle integrations and multi-signature verifications to avoid fake claims.  
📈 Analytics dashboard: On-chain queries for recycling stats and impact reports.

## 🛠 How It Works

This project leverages the Stacks blockchain for secure, Bitcoin-anchored transactions. Users interact via a dApp interface that calls Clarity smart contracts. The system tracks physical materials through QR codes or NFC tags linked to on-chain NFTs, ensuring real-world actions are mirrored on the blockchain.

### Key Smart Contracts (8 in Total)
The app is powered by 8 interconnected Clarity smart contracts for modularity and security:

1. **RecycleToken.clar**: A fungible token (FT) contract for the reward token (e.g., $RECYCLE). Handles minting, burning, and transfers.  
2. **UserRegistry.clar**: Manages user profiles and roles (consumer, collector, processor). Includes KYC-like verification for processors.  
3. **MaterialBatch.clar**: NFT contract representing batches of recyclables (e.g., plastics, metals). Each NFT holds metadata like type, weight, and origin.  
4. **DepositStation.clar**: Allows consumers to deposit materials and mint a MaterialBatch NFT. Triggers initial reward claims.  
5. **TrackingLedger.clar**: Logs transfers and status updates (e.g., "deposited", "collected", "processed") for each MaterialBatch.  
6. **VerificationOracle.clar**: Integrates with off-chain oracles to confirm real-world events (e.g., weight verification at processing plants).  
7. **RewardPool.clar**: Manages a pool of tokens for distributions based on verified actions, with staking options for bonus rewards.  
8. **GovernanceDAO.clar**: Enables token holders to vote on system parameters, like reward rates or new material types.

### For Consumers
- Scan a QR code at a recycling station or use the app to log your deposit.  
- Call `DepositStation::deposit-material` with details like material type and estimated weight.  
- Receive a MaterialBatch NFT as proof, and claim initial $RECYCLE tokens from `RewardPool::claim-reward`.  
- Track your batch's journey via `TrackingLedger::get-batch-history`.  

Boom! You've earned tokens while helping the planet—redeem them for discounts, donations, or staking.

### For Collectors/Transporters
- Claim custody of a MaterialBatch NFT by calling `TrackingLedger::transfer-custody`.  
- Verify pickup with geolocation data fed to `VerificationOracle::submit-proof`.  
- Earn transfer rewards upon successful handoff to processors.

### For Processors
- Receive batches and confirm processing via `VerificationOracle::verify-processing`.  
- Update status in `TrackingLedger::mark-processed`, triggering final rewards to all parties.  
- Use `UserRegistry::get-role` to ensure only verified processors can finalize.  

Instant transparency: Query any batch to see its full lifecycle, reducing fraud and building trust.

### Getting Started
1. Set up a Stacks wallet (e.g., Hiro Wallet).  
2. Deploy the contracts on Stacks testnet using Clarity tools.  
3. Interact via the dApp: Generate a material hash (e.g., SHA-256 of deposit photo/data), register it, and start recycling!  

This project promotes sustainable habits by gamifying recycling with blockchain incentives, potentially reducing landfill waste by encouraging participation. Fork and contribute to make it even greener! 🚀