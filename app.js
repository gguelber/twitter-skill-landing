// Solana Integration Logic
// Supabase Configuration (Tunnel to Local)
const SUPABASE_URL = 'https://gaia-twitter-skill.loca.lt';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
// Graceful Supabase Init
let supabaseClient = null;
if (typeof supabase !== 'undefined') {
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase initialized.");
} else {
    console.error("Supabase library not loaded. Check CDN or Network.");
}

// Custom Notification Logic
const showNotification = (message, type = 'info') => {
    console.log(`[Gaia Notify] ${type.toUpperCase()}: ${message}`);
    const container = document.getElementById('notification-container');
    if (!container) return console.warn("Notification container missing from DOM.");

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️')}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

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
    showNotification("Phantom Wallet not found! Redirecting...", "error");
    setTimeout(() => window.open('https://phantom.app/', '_blank'), 2000);
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

// Resilient RPC Pool (Public & Community Endpoints)
// Focused on stability for public dApps
const RPC_ENDPOINTS = [
    'https://solana-mainnet.g.allnodes.com',
    'https://solana.public-rpc.com',
    'https://api.mainnet.solana.com',
    'https://api.mainnet-beta.solana.com'
];

// Implementation of the purchase
const handlePurchase = async () => {
    console.log("Gaia Purchase Started...");
    const provider = getProvider();
    if (!userWallet) {
        showNotification("Please connect your wallet first!", "info");
        connectBtn.click();
        return;
    }

    showNotification("Contacting Solana Network...", "info");

    let blockhash = null;
    let successfulConnection = null;

    // Aggressive but graceful Retry Loop
    for (const url of RPC_ENDPOINTS) {
        try {
            console.log(`Trying RPC: ${url}`);
            const connection = new solanaWeb3.Connection(url, {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 20000
            });

            // We use a Promise with a timeout to prevent hanging
            const result = await Promise.race([
                connection.getLatestBlockhash('confirmed'),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
            ]);

            blockhash = result.blockhash;
            successfulConnection = connection;
            if (blockhash) {
                console.log("Blockhash secured via:", url);
                break;
            }
        } catch (err) {
            console.warn(`RPC failed (${url}):`, err.message);
            // Wait 500ms before next try to satisfy rate limiters
            await new Promise(r => setTimeout(r, 500));
        }
    }

    if (!blockhash) {
        showNotification("All public nodes are congested. Wait 30s.", "error");
        return;
    }

    try {
        showNotification("Transaction ready! Check your wallet...", "info");

        const transaction = new solanaWeb3.Transaction().add(
            solanaWeb3.SystemProgram.transfer({
                fromPubkey: userWallet,
                toPubkey: new solanaWeb3.PublicKey(TREASURY_WALLET),
                lamports: PRICE_SOL * solanaWeb3.LAMPORTS_PER_SOL,
            })
        );

        transaction.feePayer = userWallet;
        transaction.recentBlockhash = blockhash;

        const { signature } = await provider.signAndSendTransaction(transaction);

        console.log("Transaction Sent:", signature);
        showNotification("Transaction sent! Recording sale...", "success");

        // Record sale in Supabase
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('sales')
                .insert([
                    { wallet_address: provider.publicKey.toString(), signature: signature, amount_sol: PRICE_SOL }
                ]);

            if (error) console.error("Error saving to DB:", error);
        }

        showNotification("Redirecting to dashboard...", "success");
        setTimeout(() => window.location.replace(`success.html?sig=${signature}`), 2000);

    } catch (err) {
        console.error("Transaction failed", err);
        if (err.message.includes('403')) {
            showNotification("Network congestion. Try again in 10s.", "error");
        } else if (err.message.includes('User rejected')) {
            showNotification("Transaction cancelled by user.", "info");
        } else {
            showNotification("Transaction error: " + (err.message || "Check wallet"), "error");
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
