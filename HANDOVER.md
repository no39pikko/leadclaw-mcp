# LeadClaw MCP — エンジニア引継書

> このドキュメントは、LeadClaw MCPサーバのデモ実装を引き継ぐエンジニア向けです。
> 最初に **「1. プロジェクトの本質」** を必ず読んでから、技術セクションに進んでください。

---

## 1. プロジェクトの本質 — 最初に必ず読んでください

**LeadClawは技術プロジェクトではなく、事業のためのデモ実装です。**

最終ゴールは「動くMCPサーバ」を作ることではなく、**「Claudeに営業を頼めるサービス」というコンセプトをデモ動画とピッチで伝えること**です。技術的に高度である必要はありません。フェイクデータでいいので、Claude Desktopから自然に呼び出せて、それっぽい結果が返ってくることが最重要。

### 一文で言うと

**「Claude経由で人間SDRに営業アポ獲得を発注できる、従量課金型のサービス」**

提供するのはツールではなく **結果（確定したアポ）**。CRMでも、リードDBでも、メール自動化ツールでもない。「カレンダーに3件のアポが入る」という最終結果を売る。

### よくある誤解（これを避けてください）

| 誤解 | 正解 |
|---|---|
| AIが営業電話を自動でかけるサービス | 違う。**フィリピン/インド等の人間SDR**が電話する。AIはマッチング・品質管理・課金・レポートのみ |
| SDRエージェンシーの効率化ツール | 違う。エージェンシー自体の**完全代替**。顧客はSDRと一切やり取りしない |
| リード（見込み顧客リスト）を提供 | 違う。**確定したアポイントメント**を納品。Apollo/ZoomInfo/Lusha系とは根本的に違う |
| 既存リードに何かをするツール | 違う。CRM連携でもナーチャリングでもない。**ゼロから新規アポを獲得して納品** |
| 営業を自分でやる人向け | 違う。営業を**やりたくない・できない・時間がない**人向け。「話さなくていい」がコンセプト |
| AIエージェントが自律的に何かをする | 違う。**人間SDRをClaude経由で発注できるマーケットプレイス**。Claudeはインターフェースに過ぎない |

### 顧客が体験するフロー

1. Claude Desktop に LeadClaw MCP を接続（初回のみ）
2. 必要な時にClaudeに自然言語で依頼：「来週、医療系SaaSのVPと2件アポ取って」
3. Claudeが LeadClaw に依頼を送信
4. 数時間〜数日後、Claudeから通知：「2件確定しました」
5. 顧客は商談に出るだけ
6. アポ確定分だけ自動課金（$50-150/件）

### ターゲット顧客

- 時間がない忙しいスタートアップCEO/Founder（従業員1-30人規模）
- ソロプレナー、個人コンサルタント
- 営業活動を「面倒くさい」と感じている技術系創業者
- AIネイティブで Claude Desktop / Cursor / Claude Code を日常的に使う層

---

## 2. 現在のスコープと完成状態

### 完成しているもの（今回引き継ぐ範囲）

- ローカルで動くMCPサーバ（TypeScript / Node.js）
- Claude Desktopから stdio で接続可能
- 3つのMCPツールが動作:
  - `book_appointments` — アポ獲得依頼を受付
  - `check_status` — 依頼ステータス確認（時間ベースで擬似的に進捗）
  - `get_appointment_details` — 個別アポの詳細（BANT、SDRメモ、会議リンク）
- フェイクデータ生成（会社、人名、BANT、平日営業時間内の会議時間）
- `data/store.json` でのデータ永続化
- 「処理中→マッチング→架電中→完了」のステータス遷移シミュレーション
- README.md（セットアップ手順）

### スコープ外（今回はやらない）

- 実際のSDR採用・マッチング
- 実際の電話システム連携
- Stripe等の決済連携
- OAuth認証（stdioローカル想定なので不要）
- 本番デプロイ
- Anthropic Connectors Directoryへの申請
- Webダッシュボード

### 成果物の使い道

- デモ動画撮影に使う（Claude Desktopから「アポ取って」と入力 → それっぽいレスポンス）
- ピッチでのライブデモ
- ウェイトリストLP立ち上げの後、最初の数件のリアル運用に転用される可能性

---

## 3. 技術スタック

| 項目 | 採用 |
|---|---|
| 言語 | TypeScript |
| ランタイム | Node.js 18+（開発時はNode 24） |
| MCP SDK | `@modelcontextprotocol/sdk` v1.29.0 |
| バリデーション | `zod` v3.25系（**注**: `zod/v3` サブパスから import） |
| 永続化 | JSONファイル（`data/store.json`） |
| 接続方式 | stdio（Claude Desktop標準） |

### なぜSQLiteではなくJSON

仕様書では「SQLiteまたはJSON」と書かれており、以下の理由でJSONを採用:

- データ量が極小（デモなので数十件程度）
- Windows環境で `better-sqlite3` のネイティブビルドが面倒になりがち
- デバッグ時に中身を直接目視できる
- バックアップ・初期化が `rm data/store.json` の一行

将来データ量や同時実行が増えるなら SQLite に切り替えても良いが、現状の用途では過剰。

### zodのimportに関する注意

`@modelcontextprotocol/sdk` 1.29 は zod v3/v4 両対応の型定義になっており、通常の `import { z } from "zod"` だとTypeScriptのオーバーロード解決が無限に深くなって `TS2589: Type instantiation is excessively deep` で死にます。

**回避策**: `import { z } from "zod/v3"` と書く。zod 3.25系で提供されているサブパス。挙動は通常の `zod` と同一。

このプロジェクト内の全 `tools/*.ts` ですでに対応済み。新規ツール追加時もこの形を踏襲してください。

---

## 4. ファイル構成

```
leadclaw-mcp/
├── README.md                    セットアップ手順（ユーザー向け）
├── HANDOVER.md                  この引継書
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts                 MCPサーバエントリ（stdio transport）
│   ├── tools/
│   │   ├── book.ts              book_appointments
│   │   ├── status.ts            check_status（時間ベース進捗シミュレーション）
│   │   └── details.ts           get_appointment_details
│   ├── mock/
│   │   ├── companies.ts         フェイク会社プール（AI/SaaS系20社）
│   │   ├── people.ts            フェイク人名・デフォルト役職リスト
│   │   └── generator.ts         アポ生成・BANT文・会議時間（date_range自然言語パース込み）
│   └── db/
│       └── store.ts             JSON永続化
├── data/
│   └── store.json               実行時に自動生成（gitignore済み）
└── dist/                        ビルド成果物
```

---

## 5. セットアップ手順

```bash
git clone <this repo>
cd leadclaw-mcp
npm install
npm run build
```

`dist/index.js` が生成されればOK。

### Claude Desktopへの接続

設定ファイル:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "leadclaw": {
      "command": "node",
      "args": ["/absolute/path/to/leadclaw-mcp/dist/index.js"]
    }
  }
}
```

Claude Desktopを完全再起動（タスクトレイから終了→起動）すると、3つのLeadClawツールが利用可能になります。

### Claude Desktopなしでの動作確認

```bash
node dist/index.js
```

stdinに以下を流す:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

3つのツール定義が返ってくれば正常。

---

## 6. 各ツールの仕様

### `book_appointments`

**説明**: 営業アポ獲得を依頼。`request_id` を返す。

**入力**:
| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `location` | string | ○ | 地域。例: `"Dallas, TX"`, `"San Francisco Bay Area"` |
| `count` | number (1-10) | ○ | 欲しいアポ件数 |
| `industry` | string | - | 対象業界 |
| `target_role` | string | - | 対象役職 |
| `date_range` | string | - | 希望日程（自然言語可）|
| `budget_per_appointment` | number | - | 1件あたり予算USD（デフォルト100）|
| `notes` | string | - | 特記事項 |

**返り値**: `request_id`, `status: "processing"`, `estimated_completion`, `message`

### `check_status`

**説明**: 依頼ステータスを確認。経過時間ベースで進捗をシミュレート。

**入力**: `request_id` (string, 必須)

**ステータス遷移（実装は [src/tools/status.ts](src/tools/status.ts)）**:

| 経過時間 | phase | 確定件数 |
|---|---|---|
| 0〜5秒 | `processing` | 0 |
| 5〜15秒 | `matching` | 0 |
| 15秒〜 | `in_progress` | 1 |
| +30秒ごと | `in_progress` | +1 |
| 全件確定後 | `completed` | N |

**デモ撮影時の調整**: 早送りしたい場合は `MATCHING_AT_MS` / `IN_PROGRESS_AT_MS` / `PER_CONFIRMATION_MS` をいじる。逆に長尺デモなら時間を伸ばす。

### `get_appointment_details`

**説明**: 個別アポのフル情報。

**入力**: `appointment_id` (string, 必須)

**返り値**: 会社情報、規模、ステージ、役職、会議時間、ミーティングリンク、BANT 4項目、SDRメモ

---

## 7. デモ録画シナリオ

このMCPサーバの**唯一の評価軸は「デモ動画として映えるか」**です。コード品質より、Claudeから呼ばれた時のレスポンス文言の自然さが重要。

### 30秒デモ

```
[0-3秒] Claude Desktop
ユーザー入力:
  "Book 3 sales appointments next Tuesday in Dallas
   with AI startup CEOs. Budget $450."

[3-7秒] Claude応答:
  "I'll handle that with LeadClaw. Submitting now..."
  （book_appointments の tool call カードが表示）

[7-15秒] テロップ「2 days later」→ Claudeから通知:
  "3 appointments confirmed:
   - Tue 10am: Sarah Chen, Nexus AI
   - Tue 2pm: Marcus Rodriguez, Prism Data
   - Tue 4pm: Priya Patel, Apex Logic
   All BANT 4/4. Calendar updated."

[15-25秒] テロップ:
  ✗ No meetings
  ✗ No onboarding
  ✗ No SDR management
  ✓ Just appointments

[25-30秒] ロゴ + URL
  "LeadClaw: Sales appointments, on demand."
```

実装ゴール: **実際にClaude Desktopで「Book 3 sales appointments...」と入力したら、本当にこのレスポンスが返ってくる状態**。すでに達成済み。

---

## 8. 実装方針 — トーンとレスポンスの文言

MCPツールのレスポンスメッセージは**そのままClaude経由でユーザーに見える**ため、文言が非常に重要。

### 良い例

> "3 appointments confirmed. All meet BANT criteria (4/4). Calendar invites sent. Your morning is free."

### 悪い例

> "Operation successful. Data returned."

### トーンガイド

- プロフェッショナル、簡潔
- 「あなたの時間を守る」というコンセプトを反映
- 余計な説明はしない、結果だけ伝える
- 数字は具体的に（「いくつか」じゃなく「3件」）
- 「人間SDRがやってる体」を維持。AIが電話してるかのような表現はNG

---

## 9. 次のフェーズ（参考、優先度低）

このMCPサーバ完成後の流れ:

1. ✅ MCPサーバ完成 ← **イマココ**
2. デモ動画撮影・編集（Figma + Screen Studio等）
3. ランディングページとピッチ資料作成
4. X/Twitter、Reddit、Hacker News でローンチしてMCPコミュニティに展開
5. ウェイトリスト獲得
6. 実SDR採用（OnlineJobs.ph で5-10人）
7. 実顧客獲得
8. Anthropic Connectors Directory申請

### 時間が余ったら追加すると動画映えする機能

- `cancel_request`: 依頼キャンセル
- `list_my_appointments`: 過去アポ一覧
- `get_account_balance`: 累積請求額表示（架空）
- リアルなロケーション解釈（「Bay Area」→ SF/Palo Alto/Mountain View等への展開）

---

## 10. 判断に迷ったときの原則

- **「これは事業のデモ」**: 技術的純粋性より、見栄えと自然さ優先
- **「フェイクで構わない」**: ただし、ユーザーが触っていてリアルに感じる程度のフェイク
- **「Claudeから自然に呼べる」**: ツール `description` が重要。Claudeが文脈から「これ呼ぼう」と判断できる書き方に
- **「コンセプトを裏切らない」**: 「人間SDRがやってる体」を維持
- **「仕様にない制約を勝手に追加しない」**: 例えば「営業時間内のみ受付」「同一顧客のリクエスト数上限」などは、明示的な指示がなければ実装しない

---

## 11. 質問・確認窓口

判断に迷う実装上の選択肢が出たら、コミット前にオーナーに確認してください。「これは動画でこう見せたい」「このフレーズはブランドと合うか」など、デモ動画の見栄え・ピッチへの影響を含む判断は仕様書だけでは決まりません。

頼みます。
