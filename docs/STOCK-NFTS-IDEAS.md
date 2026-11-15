# Idea: Blocky NFTs x Tokenized Stocks on Base — cho BaseCity

> Research + ý tưởng mở rộng. Ngày: 2026-11-13.
> Bối cảnh: BaseCity đã có **Blocky Street** (`src/stocks.js`) — 8 tháp cổ phiếu Coinbase tokenized, xây bằng block theo transfer thật, + Street Crew (mỗi $10 cổ phiếu = 1 Blocky thợ xây), Blocky 10 basket, bell post. **BCB NFT** (`contracts/BaseCityBlockies.sol`) là ERC-721 thường: earn bằng cách giữ $BLOCKY, claim bằng chữ ký ledger, metadata động (`api/nft/[id].js`), 10k supply, royalty 5%, có vote 1 NFT = 1 phiếu.
> Deadline đang nhắm: **Stocks Maxxing 2026-12-05** (50% onchain traction, 25% product, 25% build-in-public).

---

## 1. Cái đang có (đừng làm lại)

| Đã có | Ý nghĩa cho ý mới |
|---|---|
| Blocky Street: tháp = volume DEX 24h, block rơi realtime, block glow = ngoài giờ NYSE | Đã "thị trường sống" trong city. Ý mới phải **dùng lại** dữ liệu này, không thêm district mới |
| Street Crew (`api/_crew.js`): ví giữ cổ phiếu → Blocky thợ xây | Đã có cầu nối ví ↔ NFT (dạng "render-only"). Thiếu: **NFT thật onchain** cho crew |
| `api/stocks?wallet=` → holdings → tháp riêng + share card | Đã có "portfolio → hình". Thiếu bước biến nó thành **sưu tầm được** |
| NFT metadata động (rarity/blocks/status/citizen since) | Có thể thêm trait **cổ phiếu** mà không cần token mới |
| Vote 1 NFT = 1 phiếu | Có thể mở rộng thành governance quanh cổ phiếu |
| OpenSea API key + floor/top offer (`src/claim.js`, `api/opensea.js`) | Đã có market data cho NFT |

---

## 2. Ý tưởng chính — xếp theo (effort × impact) cho Stocks Maxxing

### 🥇 A. "Ticker Traits" — NFT biết bạn hold gì (đã note ở NEXT.md, nhưng chưa ai làm tới mức onchain)
**Ý**: Blocky mặc theo danh mục cổ phiếu của ví chủ, đọc **onchain tại thời điểm claim + cập nhật**.
- NVDA → mũ bảo hiểm chip xanh lá; TSLA → bánh xe; AAPL → huy hiệu; MSTR → mũ vàng bitcoin; SNDK → áo giáp silicon.
- **Điểm mới so với NEXT.md**: thay vì chỉ "read từ ví" mỗi lần render (dễ, nhưng không sưu tầm được), hãy **đóng băng trait vào metadata NFT** tại thời điểm claim (`Portfolio snapshot`), rồi cho **re-roll 1 lần/tuần** bằng cách trả gas (hoặc free, có rate limit). → Tạo lý do quay lại + câu chuyện "Blocky của tôi phản ánh danh mục của tôi".
- **Onchain traction**: mỗi re-roll là 1 tx trên Base (đếm được cho ban giám khảo). Có thể tính phí nhỏ → treasury.
- **Rủi ro**: cần owner đồng ý vì đụng look NFT (NEXT.md đã ghi ⚠️). → Thiết kế **additive**: trait cổ phiếu là *phụ kiện* (hat/badge), không đổi base look.

**Vì sao mạnh cho cuộc thi**: 25% "product" + 50% "traction" — mỗi NFT có động lực onchain lặp lại, không chỉ mint 1 lần.

---

### 🥈 B. "Stock Citizen" — nhánh NFT thứ 2 (ERC-721 hoặc ERC-1155) cho Street Crew
**Ý**: Street Crew hiện là render-only. Cho ví giữ cổ phiếu **claim 1 NFT "Street Crew Pass"** (không phải BCB, collection riêng) khi:
- Giữ ≥ $10 cổ phiếu Coinbase trên Base **và** đã hold ≥ 1 ngày (giống citizen rule), **và** đã build ít nhất 1 tháp.
- Pass này: (a) đổi look Blocky trong city (mũ bảo hiểm màu stock), (b) **1 pass = 1 phiếu phụ** trong vote (hoặc vote riêng về "stock nào lên board tiếp theo"), (c) unlock quyền đặt 1 "shop nhỏ" dưới chân tháp của stock đó.
- **Onchain**: claim = tx (như BCB, dùng lại `claim` flow + signer). Rẻ để deploy: có thể chỉ là **ERC-721 mới, cùng pattern**.
- **Vì sao quan trọng**: hiện tại crew chỉ là "nice animation". Biến nó thành **asset** → người ta có lý do giữ cổ phiếu qua cuối tuần (đúng thesis Blocky Street: "Wall Street đóng, Base không").

---

### 🥉 C. "Blocky Index NFT" — mint basket Blocky 10 thành 1 NFT
**Ý**: Blocky 10 hiện chỉ là "copy list + mở Quadra". Đổi thành:
- Mua basket trên Quadra → **mint 1 "Blocky 10 NFT"** (ERC-721, 1/10 supply, ví dụ 1000 cái), đúc bằng signature từ API BaseCity sau khi xác minh các token đã về ví.
- NFT này: (a) là **huy hiệu danh dự** trong city — Blocky đội vương miện Index, (b) metadata liệt kê 10 ticker + % (đọc onchain balances), (c) **royalty chia cho treasury** → quỹ mua back $BLOCKY.
- **Onchain traction**: mỗi lần mint = 1 tx; mỗi lần rebalance = 1 loạt swap → đo được "city volume".
- **Khác biệt với B**: B thưởng *hành vi giữ*, C thưởng *hành vi mua rổ* → hai funnel khác nhau, không cạnh tranh.

⚠️ Lưu ý pháp lý: cổ phiếu tokenized không bán cho US persons — mọi UI phải có "not offered in the U.S." (code hiện đã có dòng này ở panel Blocky 10, giữ nguyên).

---

## 3. Ý tưởng phụ (nhẹ hơn, làm trong 1–2 ngày)

| # | Ý | Onchain? | Ghi chú |
|---|---|---|---|
| D1 | **After-hours badge** cho NFT: block glow trong tower = Blocky đeo kính phát sáng khi mint trong giờ NYSE đóng | Mint-time trait (1 tx) | Rẻ, dễ, story "Base never sleeps" |
| D2 | **Bell Post NFT**: mỗi lần post bell (9:30/16:00 ET) → mint 1 "Bell NFT" miễn phí cho 1 ví ngẫu nhiên đang hold cổ phiếu | 1 tx/ngày | Tạo thói quen check-in; có thể phát cho Street Crew |
| D3 | **Leaderboard onchain**: top 10 ví theo USD cổ phiếu → bảng trong city + 1 NFT "Top Trader" hàng tuần cho top 1 | 1 tx/tuần | Đơn giản, tận dụng `/api/stocks?crew` |
| D4 | **Stock-gated district**: mở khóa 1 khu "IPO District" khi tổng volume tokenized trên Base đạt mốc (đọc từ `/api/stocks`) | Không (render) | Chỉ là "quest" cộng đồng, không cần token |
| D5 | **Dynamic NFT art**: `api/nft/[id].svg` đã động — thêm frame theo giá $BLOCKY (xanh/đỏ) hoặc theo top stock của tuần | Free (metadata) | 0 gas, nhưng OpenSea cache — cần ERC-4906 `BatchMetadataUpdate` (contract đã hỗ trợ!) |

---

## 4. Đề xuất kiến trúc (nếu làm A + B)

```
Ví holder cổ phiếu (Coinbase tokenized trên Base)
        │
        ├─ /api/stocks?wallet=  (đã có)  ──► holdings
        │                                   │
        │                                   ├─► A: snapshot portfolio → trait phụ kiện
        │                                   │      (mint/re-roll qua api/nft + signer)
        │                                   │
        │                                   └─► B: Street Crew Pass claim
        │                                          (collection thứ 2, cùng signer pattern)
        │
        └─ City render (src/stocks.js) đọc pass → Blocky đổi mũ
```

**Không cần chain mới, không cần indexer ngoài**: mọi thứ đã có trong `_stocks.js` (Coinbase list, RPC, Chainlink NAV) và `_sig.js` (EIP-712 signer).

**Điều cần thêm mới (nhỏ)**:
1. `contracts/BaseCityStocks.sol` — bản sao `BaseCityBlockies.sol`, đổi `Claim` typehash thành `ClaimPass(address to,uint256 passId,...)` hoặc dùng chung contract với role. Có thể deploy trong 1 buổi (code đã có, chỉ đổi tên + MAX_SUPPLY).
2. `api/stocks.js` thêm route `?claimpass=` (kiểm tra crew entry → sign).
3. `src/stocks.js` đọc `hasPass` → đổi mũ Blocky crew.

---

## 5. Xếp hạng cuối (theo mục tiêu cuộc thi)

| Ưu tiên | Ý | Lý do |
|---|---|---|
| 1 | **A. Ticker Traits onchain** | Product depth + lặp lại onchain + hình ảnh dễ viral ("Blocky của tôi = danh mục của tôi") |
| 2 | **B. Street Crew Pass NFT** | Biến crew từ animation thành tài sản; đúng "traction" mà ban giám khảo đếm được |
| 3 | **D2. Bell Post NFT** | Build-in-public content hằng ngày, gần như free |
| 4 | **C. Blocky Index NFT** | Flagship, nhưng cần coordination với Quadra → rủi ro tiến độ |
| 5 | D1/D5 | Nice-to-have, làm nếu còn thời gian |

**Nếu chỉ chọn 1**: làm **A**, vì nó dùng lại 100% hạ tầng có sẵn (`api/nft`, signer, OpenSea), chỉ thêm trait + re-roll tx → demo được ngay, đếm được traction, và kể được story "NFT sống theo danh mục thật".