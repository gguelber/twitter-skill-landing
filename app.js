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

// Resilient RPC Pool
const RPC_ENDPOINTS = [
    'https://rpc.ankr.com/solana',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://mainnet.helius-rpc.com/?api-key=dc96726b-76bb-4933-9fc8-cc02dc7460f1', // Public proxy
    'https://api.mainnet-beta.solana.com'
];

// Implementation of the purchase
const handlePurchase = async () => {
    const provider = getProvider();
    if (!userWallet) {
        alert("Please connect your wallet first!");
        connectBtn.click();
        return;
    }

    let currentRpcIndex = 0;
    let blockhash = null;
    let successfulConnection = null;

    // Retry Loop for Blockhash (The 403 hotspot)
    while (currentRpcIndex < RPC_ENDPOINTS.length && !blockhash) {
        try {
            console.log(`Trying RPC: ${RPC_ENDPOINTS[currentRpcIndex]}`);
            const connection = new solanaWeb3.Connection(RPC_ENDPOINTS[currentRpcIndex], 'confirmed');
            const result = await connection.getLatestBlockhash();
            blockhash = result.blockhash;
            successfulConnection = connection;
        } catch (err) {
            console.warn(`RPC ${currentRpcIndex} failed:`, err.message);
            currentRpcIndex++;
        }
    }

    if (!blockhash) {
        alert("Solana Network is extremely congested. All public nodes are rate-limiting right now. Please wait 1 minute and try again.");
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
            alert("Security Block (403): The Solana network is blocking this request. Please try again in 10 seconds.");
        } else {
            alert("Transaction error: " + (err.message || "Please check your Phantom wallet balance."));
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
