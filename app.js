// Solana Integration Logic
// Supabase Configuration (Tunnel to Local)
const SUPABASE_URL = 'https://gaia-twitter-skill.loca.lt';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Custom Notification Logic
const showNotification = (message, type = 'info') => {
    const container = document.getElementById('notification-container');
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

// Resilient RPC Pool (Public Endpoints)
const RPC_ENDPOINTS = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
    'https://rpc.ankr.com/solana',
    'https://mainnet.helius-rpc.com/?api-key=dc96726b-76bb-4933-9fc8-cc02dc7460f1' // Backup (Rate-limited public key)
];

// Implementation of the purchase
const handlePurchase = async () => {
    const provider = getProvider();
    if (!userWallet) {
        alert("Please connect your wallet first!");
        connectBtn.click();
        return;
    }

    let blockhash = null;
    let successfulConnection = null;

    // Aggressive Retry Loop
    for (const url of RPC_ENDPOINTS) {
        try {
            console.log(`Trying RPC: ${url}`);
            const connection = new solanaWeb3.Connection(url, {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 60000
            });
            const result = await connection.getLatestBlockhash('confirmed');
            blockhash = result.blockhash;
            successfulConnection = connection;
            if (blockhash) {
                console.log("Blockhash secured via:", url);
                break;
            }
        } catch (err) {
            console.warn(`RPC failed (${url}):`, err.message);
        }
    }

    if (!blockhash) {
        showNotification("Solana nodes are congested. Retrying...", "info");
        showNotification("Tip: Use a dedicated RPC for 100% uptime.", "info");
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

        const { signature } = await provider.signAndSendTransaction(transaction);

        console.log("Transaction Sent:", signature);
        showNotification("Transaction sent! Recording sale...", "success");

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
            showNotification("Network congestion. Please try again in 10s.", "error");
        } else {
            showNotification("Transaction error: " + (err.message || "Check wallet balance"), "error");
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
