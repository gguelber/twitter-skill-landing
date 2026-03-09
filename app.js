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

// --- WEB3 CONFIGURATION ---
// Even with the official SDK, Solana requires a "Connection" (RPC) to 
// fetch a 'recent blockhash'. Public nodes often block github.io, 
// so we use a resilient rotation strategy.
const RPC_NODES = [
    'https://api.mainnet-beta.solana.com',
    'https://solana.drpc.org',
    'https://solana-mainnet.rpc.extrnode.com'
];

// Unified Connection logic for Mobile & Desktop
const handlePurchase = async () => {
    console.log("Gaia Purchase Started (v2.7)...");
    const provider = getProvider();
    if (!provider) return; // Ensure provider is available

    if (!userWallet) {
        showNotification("Please connect your wallet first!", "info");
        connectBtn.click();
        return;
    }

    showNotification("Contacting Solana Network...", "info");

    let blockhash = null;
    let connection = null;

    // Aggressive Retry Loop with node rotation
    for (const node of RPC_NODES) {
        try {
            console.log(`Trying RPC Node: ${node}`);
            connection = new solanaWeb3.Connection(node, 'confirmed');
            const result = await connection.getLatestBlockhash('confirmed');
            blockhash = result.blockhash;
            if (blockhash) {
                console.log("Success with node:", node);
                break;
            }
        } catch (err) {
            console.warn(`Node ${node} failed:`, err.message);
            showNotification("Node busy, trying alternative...", "info");
            // Wait 1s to allow network breathing room
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    if (!blockhash) {
        showNotification("Netork congested. Please try in 30s.", "error");
        return;
    }

    try {
        const transaction = new solanaWeb3.Transaction().add(
            solanaWeb3.SystemProgram.transfer({
                fromPubkey: userWallet,
                toPubkey: new solanaWeb3.PublicKey(TREASURY_WALLET),
                lamports: PRICE_SOL * solanaWeb3.LAMPORTS_PER_SOL,
            })
        );

        transaction.feePayer = userWallet;
        transaction.recentBlockhash = blockhash;

        showNotification("Verify the transaction in Phantom!", "success");
        const { signature } = await provider.signAndSendTransaction(transaction);

        console.log("Transaction Sent:", signature);
        showNotification("Tx Sent! Updating Database...", "success");

        // Record sale in Supabase
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('sales')
                .insert([
                    { wallet_address: provider.publicKey.toString(), signature: signature, amount_sol: PRICE_SOL }
                ]);

            if (error) console.error("Error saving to DB:", error);
        }

        // Redirect to success page
        window.location.replace(`success.html?sig=${signature}`);

    } catch (err) {
        console.error("Transaction failed", err);
        if (err.message.includes('403')) {
            showNotification("Security Block (403). Try again in 10s.", "error");
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
