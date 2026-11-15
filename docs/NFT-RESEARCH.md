# Research: the NFT side of BaseCity

> Ngày: 2026-11-14. Tài liệu nghiên cứu — hạ tầng đang có, khoảng trống, và những gì đáng làm tiếp.
> Xem thêm: `docs/STOCK-NFTS-IDEAS.md` (ý tưởng NFT × cổ phiếu), `docs/NEXT.md` (việc đang mở).

---

## 1. Hiện trạng: một NFT collection đã có, khá đầy đủ

| Thành phần | Ở đâu | Trạng thái |
|---|---|---|
| ERC-721 + ERC-2981 royalty 5% | `contracts/BaseCityBlockies.sol`, `0xD1C1…d5a9` | ✅ deployed, có `setSigner`, `setBaseURI`, `ERC-4906` |
| Mint bằng chữ ký (EIP-712 `Claim`) | `api/claim.js` + `api/_sig.js` | ✅ signer server, `MAX_IDS` mỗi tx, chống mint trùng theo `_ownerOf` |
| Metadata động | `api/nft/[id].js` | ✅ rarity / trait / role / status / blocks placed / citizen since |
| Ảnh NFT (SVG, deterministic) | `src/voxel-svg.js` | ✅ cùng renderer với web; seed khoá cứng ảnh |
| Marketplace | `api/opensea.js` + `src/listing.js` | ✅ listing Seaport ký trong ví, floor/offer qua OpenSea API |
| Giá gợi ý | `src/pricing.js` | ✅ floor × hệ số rarity, sàn neo theo chi phí earn |
| Bán hàng / create offer | `api/_market.js`, `api/opensea.js` | ✅ đọc listing + best offer |
| Utility: bỏ phiếu | `api/vote.js` + `src/vote.js` | ⚠️ code đủ, `CONFIG.vote` đang `null` (chưa có round) |
| Utility: ràng buộc gameplay | — | ❌ chưa có |
| Utility: holder perk | — | ❌ chưa có |

**Điểm mạnh hiện tại**: NFT không được "mua" mà **được làm ra** ($10 $BLOCKY × 6 giờ), nên nguồn cung có tính kinh tế thật; metadata thay đổi theo hành vi trong thành phố (blocks placed), tức là **NFT phản ánh lịch sử tham gia**, không chỉ là ảnh.

---

## 2. Khoảng trống — 5 chỗ có thể khai thác

### 2.1 NFT chưa "làm gì" trong game
Hiện một Blocky NFT và một Blocky chưa claim **giống hệt nhau** trong thành phố. Claim chỉ đổi chỗ giữ: từ ledger sang ví. Không có lý do *gameplay* nào để claim ngoài việc bán được.

Điều này làm utility yếu so với chuẩn NFT game hiện tại (holder = quyền truy cập / vai trò).

### 2.2 Vote chưa mở
`CONFIG.vote = null`. Một round đơn giản ("cổ phiếu nào lên tháp thứ 9 trên Blocky Street") sẽ dùng lại toàn bộ code có sẵn và tạo utility tức thì. Đây là đòn rẻ nhất.

### 2.3 Không có "traits" đọc từ onchain holdings
Đây đúng là ý **A. Ticker Traits** trong `STOCK-NFTS-IDEAS.md`: NFT đã có metadata động, đã có `api/stocks?wallet=`, nhưng chưa nối vào. Nối vào là có thêm một lớp utility/identity rất đặc trưng.

### 2.4 Chưa có marketplace nội bộ / đường "mua bằng $BLOCKY"
`src/listing.js` đẩy người dùng sang OpenSea. Một **"Blocky Market" trong thành phố** (mua bán bằng $BLOCKY, hoặc mua-bằng-UNI-swap-rồi-claim) sẽ giữ dòng tiền trong ecosystem và tăng volume $BLOCKY. Rủi ro: cần contract escrow hoặc Seaport order — có thể làm sau.

### 2.5 Không có dữ liệu "NFT đang ở đâu trong thành phố"
Người mua trên OpenSea nhận một NFT nhưng **không thấy nó trong thành phố**. Không có link "Xem Blocky #123 của bạn trong BaseCity" đủ rõ, và không có trang nào cho holder thấy trạng thái của mình.

---

## 3. Research: cái gì đáng copy từ các NFT game trên Base

| Pattern | Cách làm | Phù hợp với BaseCity? |
|---|---|---|
| **Dynamic metadata** theo hành vi | Clanker / Art Blocks-style render theo state | ✅ đã có — chỉ cần thêm trait |
| **Holder-gated perks** (role trong app) | Mã truy cập, skin, badge | ✅ dễ: đổi look của Blocky khi claim |
| **Staking / points** | Lock NFT → accrual | ⚠️ cần contract + oracle; BaseCity không custody là điểm mạnh, tránh phá |
| **Burn-to-upgrade** | Burn 3 → 1 rare | ❌ supply 10k có giới hạn, gây rối số học |
| **Mint reveal / prank mint** | Ngẫu nhiên hoá sau mint | ❌ BaseCity đã ngẫu nhiên trước (seed) — tốt hơn |
| **Governance token per NFT** | 1 NFT = 1 phiếu | ✅ code đã có, chỉ cần mở round |
| **NFT as ticket** (event, video, art) | Cổng vào nội dung theo thời hạn | ✅️ rất hợp: Cinema, concert trong city |
| **Soulbound / reputation NFT** | Không chuyển nhượng, gắn ví | ⚠️ BCB phải tradable; nhưng có thể làm **collection thứ 2** SBT |

### Kết luận research
Hai hướng **không phá** mô hình "không custody" hiện tại:
1. **Metadata mở rộng** (traits, stock traits, role trong city) — không cần contract mới.
2. **Collection thứ 2 (SBT)** cho reputation/holder-pass — deploy contract riêng, không đụng BCB.

---

## 4. Đề xuất theo thứ tự ưu tiên

### P1 — "Blocky hat" theo danh mục (đã có code, chưa nối end-to-end)
`src/stocktraits.js` đã có 11 trait + `api/nft/[id].js` đã đọc được ledger. Việc còn lại:
- `src/claim.js` gọi `/api/stocks?wallet=` rồi truyền `stockTrait` khi render ảnh.
- Thêm attribute `Stock Trait` vào metadata.
- Contract không cần đổi nếu chấp nhận trait là *dẫn xuất* (không cần update onchain); dùng ERC-4906 `BatchMetadataUpdate` (đã hỗ trợ `setBaseURI`) để OpenSea refresh.
→ Effort: ~1 ngày. Impact: cao (NFT thay đổi theo ví, lần đầu tiên).

### P2 — Mở round vote đầu tiên
`CONFIG.vote` chỉ cần một object. Đề xuất câu hỏi: *"Which stock gets the 9th tower on Blocky Street?"* với options từ `CONFIG.stocks.blocky10`.
→ Effort: vài giờ. Impact: cao (onchain traction cho Stocks Maxxing).

### P3 — "Your Blocky in the city" trên trang claim
Thêm một khối "Where your Blockies are" — list + link `/?find=<wallet>` (đã có Find me). Nhỏ, nhưng sửa đúng lỗ hổng 2.5.
→ Effort: 2–3 giờ.

### P4 — SBT "Street Citizen" (collection thứ 2)
Một ERC-721 không chuyển nhượng, mint khi ví giữ $BLOCKY đủ 30 ngày, dùng làm:
- Badge trong city (viền vàng quanh Blocky).
- Cổng vào phòng Cinema / sự kiện.
Không đụng BCB, không đụng supply.
→ Effort: contract 1 ngày + API + UI 1 ngày.

### P5 — Nội bộ marketplace (để sau)
Không làm bây giờ: cần escrow contract, phức tạp hơn giá trị tức thời, và OpenSea đã hoạt động.

---

## 5. Rủi ro và lưu ý

- **Trait dẫn xuất vs onchain**: nếu trait đọc từ ví mỗi lần render, giao dịch bán cổ phiếu sẽ làm NFT đổi ngoại hình. Phải quyết định: snapshot lúc claim, hay live? Snapshot công bằng hơn; live gây "flashy" nhưng thay đổi liên tục.
- **Metadata cache**: OpenSea cache metadata nặng. Cần `BatchMetadataUpdate` và nói rõ trong docs của collection.
- **Royalty**: 5% đang đúng chuẩn; đừng đổi sau khi list (làm mất niềm tin).
- **Không bao giờ** yêu cầu user approve contract mới mà không cảnh báo — `src/listing.js` đã làm đúng (một lần, hiện chi phí).

---

## 6. Tóm tắt một dòng

BaseCity đã có **một NFT collection hoàn chỉnh về kỹ thuật** nhưng **chưa gắn utility vào game**. Việc rẻ nhất tạo khác biệt: (P1) stock traits trong metadata, (P2) mở vote, (P3) chỉ cho holder thấy Blocky của họ trong thành phố.
