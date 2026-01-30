// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract PilkadesVoting is Ownable, ERC2771Context {
    // Struktur kandidat
    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    // Merkle Root untuk daftar pemilih
    bytes32 public merkleRoot;

    // Status voting
    bool public isVotingActive;

    // Waktu mulai dan durasi
    uint256 public startTime;
    uint256 public duration; // dalam detik (misal 6 jam = 21600)

    // Mapping untuk mencegah double vote (key = hash NIK)
    mapping(bytes32 => bool) public hasVoted;

    // Daftar kandidat
    Candidate[] public candidates;

    // Event
    event CandidateAdded(uint256 indexed id, string name);
    event Voted(bytes32 indexed nikHash, address indexed voter, uint256 candidateId);
    event VotingStarted(uint256 startTime, uint256 endTime);
    event VotingEnded(uint256 endTime);

    // Constructor: set trusted forwarder (relayer) dari .env
    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) Ownable(msg.sender) {
        isVotingActive = false;
    }

    // FIX ERROR: Override dengan spesifikasi semua base contract untuk _contextSuffixLength
    function _contextSuffixLength() internal view virtual override(Context, ERC2771Context) returns (uint256) {
        return 20; // Standar ERC-2771: suffix berupa 20 bytes address
    }

    // Set Merkle Root (hanya owner, sekali saja)
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        require(merkleRoot == bytes32(0), "Merkle Root sudah di-set");
        merkleRoot = _merkleRoot;
    }

    // Tambah kandidat (hanya owner, sebelum voting mulai)
    function addCandidate(string memory _name) external onlyOwner {
        require(!isVotingActive, "Voting sudah dimulai, tidak bisa tambah kandidat");
        uint256 id = candidates.length + 1;
        candidates.push(Candidate(id, _name, 0));
        emit CandidateAdded(id, _name);
    }

    // Mulai voting (hanya owner)
    function startVoting(uint256 _durationInSeconds) external onlyOwner {
        require(!isVotingActive, "Voting sudah aktif");
        require(_durationInSeconds > 0, "Durasi harus lebih dari 0");
        require(candidates.length >= 2, "Minimal 2 kandidat diperlukan");

        startTime = block.timestamp;
        duration = _durationInSeconds;
        isVotingActive = true;

        emit VotingStarted(startTime, startTime + duration);
    }

    // Fungsi vote (support gasless via relayer)
    function vote(
        bytes32 _nikHash,          // keccak256(NIK) dari backend
        bytes32[] calldata _proof, // Merkle proof
        uint256 _candidateId
    ) external {
        require(isVotingActive, "Voting belum dimulai atau sudah berakhir");
        require(block.timestamp < startTime + duration, "Waktu voting telah habis");

        // Dapatkan voter asli (dari relayer atau direct call)
        address voter = _msgSender();

        // Verifikasi Merkle proof (voter terdaftar)
        require(MerkleProof.verify(_proof, merkleRoot, _nikHash), "Proof invalid: Voter tidak terdaftar");

        // Cek belum vote
        require(!hasVoted[_nikHash], "Anda sudah memberikan suara");

        // Cek kandidat valid
        require(_candidateId > 0 && _candidateId <= candidates.length, "Kandidat tidak valid");

        // Tambah vote
        candidates[_candidateId - 1].voteCount++;
        hasVoted[_nikHash] = true;

        emit Voted(_nikHash, voter, _candidateId);
    }

    // Akhiri voting manual (jika perlu, hanya owner)
    function endVoting() external onlyOwner {
        require(isVotingActive, "Voting belum aktif");
        isVotingActive = false;
        emit VotingEnded(block.timestamp);
    }

    // Lihat hasil voting (view)
    function getResults() external view returns (Candidate[] memory) {
        return candidates;
    }

    // Lihat jumlah kandidat
    function getCandidateCount() external view returns (uint256) {
        return candidates.length;
    }

    // Lihat waktu berakhir voting
    function getEndTime() external view returns (uint256) {
        return startTime + duration;
    }

    // FIX ERROR: Override dengan spesifikasi semua base contract
    function _msgSender() internal view override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata data) {
        return ERC2771Context._msgData();
    }
}