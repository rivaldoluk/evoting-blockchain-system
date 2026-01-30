// fix_mempool.js
const { ethers } = require("ethers");
require("dotenv").config();

async function fixMempool() {
    const provider = new ethers.JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_RELAYER, provider);

    const address = await wallet.getAddress();
    // Nonce yang sudah sukses di blockchain
    const confirmedNonce = await provider.getTransactionCount(address, "latest");
    // Nonce yang ada di mempool (pending)
    const pendingNonce = await provider.getTransactionCount(address, "pending");

    console.log(`Alamat Relayer: ${address}`);
    console.log(`Nonce Terkonfirmasi: ${confirmedNonce}`);
    console.log(`Nonce Pending: ${pendingNonce}`);

    if (pendingNonce > confirmedNonce) {
        console.log(`Ditemukan ${pendingNonce - confirmedNonce} transaksi nyangkut. Membersihkan...`);
        
        for (let i = confirmedNonce; i < pendingNonce; i++) {
            console.log(`Mengirim transaksi pembatal untuk Nonce: ${i}`);
            const tx = await wallet.sendTransaction({
                to: address,
                value: 0,
                nonce: i,
                gasPrice: ethers.parseUnits("100", "gwei") // Gas sangat tinggi agar instan
            });
            await tx.wait();
            console.log(`Nonce ${i} berhasil dibersihkan!`);
        }
    } else {
        console.log("Mempool sudah bersih. Tidak ada transaksi nyangkut.");
    }
}

fixMempool().catch(console.error);