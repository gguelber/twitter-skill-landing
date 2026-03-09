// Solana Integration Logic
// Supabase Configuration (Tunnel to Local)
const SUPABASE_URL = 'https://gaia-twitter-skill.loca.lt';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TREASURY_WALLET = "AgV3qYqXQPr2fD8K2hM4Rpx4v5R3L2A5Yf7N7V7W7x7";
const PRICE_SOL = 0.5;

let userWallet = null;

const connectBtn = document.getElementById('connectWallet');
const buyButtons = document.querySelectorAll('.buy-btn, .buy-btn-large');

// Check for Solana provider
const getProvider = () => {
    if ('solana' in window) {
        const provider = window.solana;
        if (provider.isPhantom) return provider;
    }
    window.open('https://phantom.app/', '_blank');
};

// Update Connect Button
const updateWalletUI = (publicKey) => {
    userWallet = publicKey;
    connectBtn.innerText = `${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}`;
    connectBtn.classList.add('connected');
};

// Connect Wallet
connectBtn.addEventListener('click', async () => {
    try {
        const provider = getProvider();
        if (provider) {
            const resp = await provider.connect();
            updateWalletUI(resp.publicKey);
        }
    } catch (err) {
        console.error("Connection failed", err);
    }
});

// Resilient Connection Factory
const getResilientConnection = () => {
    const endpoints = [
        'https://rpc.ankr.com/solana',
        'https://solana-mainnet.core.chainstack.com/5df6e3df6a157508493da62214300e40', // Public trial
        solanaWeb3.clusterApiUrl('mainnet-beta')
    ];

    // Try the first available endpoint
    return new solanaWeb3.Connection(endpoints[0], 'confirmed');
};

// Implementation of the purchase
const handlePurchase = async () => {
    const provider = getProvider();
    if (!userWallet) {
        alert("Please connect your wallet first!");
        connectBtn.click();
        return;
    }

    try {
        const connection = getResilientConnection();

        const transaction = new solanaWeb3.Transaction().add(
            solanaWeb3.SystemProgram.transfer({
                fromPubkey: userWallet,
                toPubkey: new solanaWeb3.PublicKey(TREASURY_WALLET),
                lamports: PRICE_SOL * solanaWeb3.LAMPORTS_PER_SOL,
            })
        );

        transaction.feePayer = userWallet;

        // Manual blockhash fetch with retry
        let blockhash;
        try {
            const result = await connection.getLatestBlockhash();
            blockhash = result.blockhash;
        } catch (rpcErr) {
            console.warn("Primary RPC failed (403 or Timeout), trying fallback...", rpcErr);
            const fallbackConn = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'), 'confirmed');
            const result = await fallbackConn.getLatestBlockhash();
            blockhash = result.blockhash;
        }

        transaction.recentBlockhash = blockhash;

        const { signature } = await provider.signAndSendTransaction(transaction);

        console.log("Transaction Sent:", signature);

        // Record sale in Supabase
        const { error } = await supabaseClient
            .from('sales')
            .insert([
                { wallet_address: provider.publicKey.toString(), signature: signature, amount_sol: PRICE_SOL }
            ]);

        if (error) console.error("Error saving to DB:", error);

        // Redirect to success page
        window.location.replace(`success.html?sig=${signature}`);

    } catch (err) {
        console.error("Transaction failed", err);
        if (err.message.includes('403')) {
            alert("Solana Network is congested (RPC 403). Please refresh the page and try one more time.");
        } else {
            alert("Transaction error. Please check your Phantom wallet and try again.");
        }
    }
};

buyButtons.forEach(btn => btn.addEventListener('click', handlePurchase));

// Auto-connect if already authorized
window.addEventListener('load', async () => {
    const provider = getProvider();
    if (provider) {
        provider.connect({ onlyIfTrusted: true }).then(resp => {
            updateWalletUI(resp.publicKey);
        }).catch(() => { });
    }
});
