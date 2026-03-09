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
// fetch a 'recent blockhash' - this is a security requirement of the 
// blockchain itself, not a coding choice.
const PRIMARY_RPC = 'https://api.mainnet-beta.solana.com';
const FALLBACK_RPC = 'https://solana-mainnet.g.allnodes.com';

// Unified Connection logic for Mobile & Desktop
const handlePurchase = async () => {
    console.log("Gaia Mobile-Native Purchase Started...");
    const provider = getProvider();
    if (!provider) return;

    if (!userWallet) {
        showNotification("Connecting Wallet...", "info");
        await provider.connect();
    }

    showNotification("Preparing Transaction...", "info");

    let blockhash = null;
    let connection = new solanaWeb3.Connection(PRIMARY_RPC, 'confirmed');

    try {
        // Step 1: Get latest blockhash (Solana MANDATORY step)
        const result = await connection.getLatestBlockhash();
        blockhash = result.blockhash;
    } catch (err) {
        console.warn("Primary RPC failed, switching to fallback...");
        connection = new solanaWeb3.Connection(FALLBACK_RPC, 'confirmed');
        const result = await connection.getLatestBlockhash();
        blockhash = result.blockhash;
    }

    if (!blockhash) {
        showNotification("Network busy. Please retry in 10s.", "error");
        return;
    }

    try {
        // Step 2: Build Native Transaction
        const transaction = new solanaWeb3.Transaction().add(
            solanaWeb3.SystemProgram.transfer({
                fromPubkey: userWallet,
                toPubkey: new solanaWeb3.PublicKey(TREASURY_WALLET),
                lamports: PRICE_SOL * solanaWeb3.LAMPORTS_PER_SOL,
            })
        );

        transaction.feePayer = userWallet;
        transaction.recentBlockhash = blockhash;

        // Step 3: Send to Wallet for User Consent
        showNotification("Confirm the transaction in your wallet!", "success");
        const { signature } = await provider.signAndSendTransaction(transaction);

        console.log("Tx Signature:", signature);
        showNotification("Payment Confirmed! Updating Database...", "success");

        if (supabaseClient) {
            await supabaseClient.from('sales').insert([
                { wallet_address: userWallet.toString(), signature: signature, amount_sol: PRICE_SOL }
            ]);
        }

        setTimeout(() => {
            window.location.href = `success.html?sig=${signature}`;
        }, 1500);

    } catch (err) {
        console.error("Purchase error:", err);
        showNotification(err.message.includes('rejected') ? "Canceled by user." : "Tx Failed: Check balance", "error");
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
