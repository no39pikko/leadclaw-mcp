# GTM Agent — ビルド仕様（エンジニア引き渡し用 / 確定版）

> このドキュメントは LeadClaw の **ピボット後** の仕様です。
> 旧 [HANDOVER.md](HANDOVER.md) は「Claudeに営業を頼める黒箱マネージドサービス（フェイクデモ）」の引継書。
> 本書はそれを置き換える方向性 = **「Claude自身がGTM担当者になる道具箱」** を定義します。
> 矛盾する箇所は本書を優先してください。

---

## 0. 一行で

顧客が ICP を1つ渡すと、**顧客の Claude（Claude Desktop）が GTM担当者の"脳"** として、トップオブファネルのSDR業務を一気通貫で回す MCPサーバー（=道具箱）。
リード生成 → エンリッチ → スクラブ → コールドメール → ホットリード検知 → AIコール → 予約 → 結果記録。クレジット従量課金。**脳は顧客のClaude、ツールと常駐実行はサーバー。**

旧版との違い：旧は「裏で人間SDRが動く黒箱」。本版は **「Claudeがパイプラインを指揮し、各工程は本当に自動化される道具箱」**。ただしパイプラインを1手ずつ手動指示させるのではなく、**ある程度のフローはツール側に用意し、Claude自身に判断させる**。

---

## 1. アーキテクチャ：2つのループ

(a) 顧客の Claude Desktop が MCP を叩いてループを回す構成。ただし実行は2層に分かれる。

| | 駆動者 | 役割 | 稼働タイミング |
|---|---|---|---|
| **戦略ループ** | 顧客の Claude Desktop（GTM担当者の"脳"） | ICP定義・リスト承認・チャネル戦略・フック生成・「架電するか」のルール設定・結果レビュー | 顧客がClaudeと会話している時（同期・会話的） |
| **実行ループ** | 常駐 HTTP サーバー（"手足"） | コールドメール送信、開封/クリック/返信の監視、**ホットリード検知→即AIコール(Retell)**、Webhook受け、クレジット計測、資産ストアへの記録 | 24時間自走（顧客がClaudeを開いていなくても動く） |

### 重要な技術的現実：MCPはサーバー発プッシュができない
「MCP側からClaudeにSkill.md的な定型指示を飛ばす」は、**サーバーが任意のタイミングでClaudeに割り込む形では実装できない**（MCPは client→server の向きが基本）。代わりに以下で「Claudeを誘導」する：

1. **ツールの返り値に「次にやるべきこと」を埋め込む** ← 主軸。Claudeが結果を読んで次の手を打つ。
2. **MCP Prompts 機能**で定型ワークフローのテンプレを提供。
3. **ツールの description** に振る舞いの指針を書く（Claudeが文脈から「これ呼ぼう」と判断できるように）。

→ 帰結：**時間にシビアな実行（ホットリード→即架電）はClaudeを起こすのではなくサーバーが自走でやる**。Claudeは次に顧客が会話を開いた時に `query_assets` / `get_hot_leads` で「さっき3件コールして1件取れた」と知り、戦略を調整する。これが「実行ループは常駐必須」の根拠。

---

## 2. 確定ファネル（v1）

```
define_campaign(ICP+offer+constraints)
  → build_list（1ソースから小さいリスト）
  → enrich_contact（email + phone + 1種シグナル）
  → scrub（メール到達性 + 電話バリデーション + サプレッション）   ← ハードゲート
  → generate_brief（コールドメール文面 + コール用ブリーフ）
  → 【人間承認ゲート：ICP+リスト+見込み消費クレジットをClaudeのチャット上で顧客が承認】
  → send_cold_email（トラッキングリンク入りで送信）
  → 〔常駐サーバーが監視〕返信 / リンククリック / フォーム入力 = 🔥ホット化
  → call_lead（🔥になったリードにだけ AIコール / Retell）          ← PLUGGABLE backend
  → アポ取れたら schedule_meeting（Calendar）+ write_crm（Notion）
  → log_asset（資産ストアに記録）
```

### コンプラ方針（確定）
- **AIは見ず知らずの相手にコールドコールしない。** 入口は**コールドメール**（および将来は広告）。
- **AIコールするのは「一度こちらに反応した温かいリード」だけ**（返信・クリック・フォーム）。これでTCPA/DNCの最悪部分を回避。
- `scrub` は「コールドコールDNC」より **「メール到達性 + （ホット化後の架電に向けた）電話番号バリデーション + 顧客のサプレッションリスト + 架電可能時間帯」** を強制する。
- それでも `call_lead` は `scrub(contact_id).callable == true` でない限り**必ず拒否**（法的ゲート）。

### ホットの定義（v1）
ツールで計測可能なシグナルのみ。いずれかが立てば🔥：
- **メール返信**（受信監視）
- **トラッキングリンクのクリック**（メール内リンクをサーバーのリダイレクトendpoint経由にする）
- **フォーム入力 / ランディングページのアクション**（噛ませたエンドポイントへのヒット）

---

## 3. MCPツール契約（ピボット後）

```
# --- セットアップ（phase1から再利用）---
configure_account(company_info, icp, industry, target_role)  -> ok          # 既存
get_account_info()                                            -> {settings, credits}  # 既存
define_campaign(icp, offer, constraints)                      -> campaign_id  # constraints: 許可地域/架電可能時間帯/送信ドメイン/日次上限/サプレッションリスト

# --- ソーシング ---
build_list(campaign_id, size)                                -> [contact_id]
fetch_signals(account_id, signal_type)                       -> [signal]     # v1: 求人(採用=困ってる)
enrich_contact(contact_id)                                   -> { email, phone, title, account, signals[] }

# --- コンプラ（ハードゲート）---
scrub(contact_id)                                            -> { emailable: bool, callable: bool, reasons[] }

# --- アウトリーチ（入口=コールドメール）---
generate_brief(contact_id)                                   -> { email_hook, email_body, call_brief }   # 脳の推論でも可
send_cold_email(contact_id, email)                           -> { sent, tracking_id }                    # トラッキングリンク埋込

# --- ホットリード検知（実行ループ＝常駐サーバー主導）---
# サーバーが返信/クリック/フォームを取り込み contact を hot にし AssetEvent を記録
get_hot_leads(campaign_id)                                   -> [{ contact_id, hot_signal, observed_at }]

# --- コール（旧 book_appointment。AIで温かいリードに架電。差し替え可能・計測必須）---
call_lead(contact_id, call_brief)
    -> { outcome, survived_seconds, reached_pitch, hung_up_at_open, appointment?, transcript }
# サーバーがホット化イベントで自動発火（Claudeが事前に設定したルールに従う）するか、Claudeが明示的に叩く

# --- 出力・記録 ---
schedule_meeting(appointment)                                -> calendar_event_id   # Google Calendar（既存再利用）
write_crm(record)                                            -> crm_ref             # Notion（MCPあり）
log_asset(event)                                             -> ok                  # 資産ストア
query_assets(query)                                          -> rows                # 脳が改善に使う
```

### 絶対に外せない設計原則 2つ（最適化で消すな）

**① コール工程は差し替え可能なバックエンドにする**
`call_lead(...)` は1つのインターフェースの裏で driver を差し替えられること。
- v1 は `AICallDriver`（Retell）を実装。
- `HumanCallDriver`（人間SDRディスパッチキュー）を**他工程を一切変えずに後から差し込める**こと。実装はv1では不要、**インターフェース定義＋スタブのみ**。
- 理由：「AIがコールでアポを取れるか」が本プロダクト核心の未知数。まずAIで試す。ダメなら人間SDRにこの1コンポーネントだけ差し替える。検証のたびに作り直さないため。

**② 「どこでコールが死んだか」を必ず計測する**
全コール試行が最低限これを記録：`outcome`, `survived_seconds`, `reached_pitch`(bool), `hung_up_at_open`(bool), `transcript`。
- 重要指標はアポ率ではなく**開始の生存率**。「冒頭で切られた（関与失敗）」と「喋れたが取れなかった（転換失敗）」を区別できないと改善判断ができない。
- 注：本版は温かいリードへの架電なので生存率は元から高めだが、指標としては引き続き有効。

---

## 4. データモデル（最小）

```
Campaign    { id, account_id, icp, offer, constraints }     # constraints: regions[], call_hours, sending_domain, daily_cap, suppression[]
Contact     { id, campaign_id, account, name, title, phone, email, scrub_status, hot_status, hot_signal }
Signal      { account_id, type, value, observed_at }
EmailSend   { contact_id, tracking_id, sent_at, opened_at?, clicked_at?, replied_at? }
CallAttempt { contact_id, backend, outcome, survived_seconds, reached_pitch, hung_up_at_open, transcript, ts }
Appointment { contact_id, when, calendar_event_id, status }
AssetEvent  { campaign_id, contact_id, channel, signal, hook, outcome, ts }   # ← 学習の飛輪の行
```

---

## 5. ストア構成（2つに分ける。混ぜない）

| ストア | 用途 | 実装 |
|---|---|---|
| **Notion** | 人間が読むCRM（リード/結果/アポ） | Notion MCP（接続済み） |
| **資産ストア** | オーケストレーター（脳）が集計クエリして改善に使う構造化DB。学習の飛輪＝第二のモート | **SQLite（v1、既存の `better-sqlite3` 基盤を流用）→ Postgres（後）** |

同期方向：全イベントは資産ストアに append-only。そのサブセット（顧客が読みたい粒度）を Notion にミラー。資産ストアは機械集計専用なので Notion とは粒度も目的も別。

---

## 6. クレジット課金（方針確定・単価は実測後）

- クレジット従量制は維持。ただし**「1クレジット=1アポ」から「パイプライン各工程で少しずつ消費」へ転換**。
- リード生成・エンリッチ・コールドメール・AIコールがそれぞれクレジットを消費。**結果として1アポあたり ≒ $50分** が目安。
- **v1は仮単価で置く。** オーナー（aotoh）が自分で実行し、どれくらい顧客が取れるかを見てから本単価を決める。
- 実装：phase1 の Stripe ペイメントリンク + Webhook + クレジット残高基盤を流用。**減算ロジックを `book.ts` の「アポ単位・前払い」から各ツールの「工程単位・実消費」へ分散**させる改修が必要（下記再利用マップ参照）。

---

## 7. friend の `feat/phase1` からの再利用マップ

`feat/phase1` で実装済み（認証・SQLite・Stripe・Calendar・HTTPサーバー・admin/portal・i18n）の扱い：

| コンポーネント | 扱い | メモ |
|---|---|---|
| API key 認証 / アカウント分離 (`src/auth.ts`) | **そのまま活かす** | マルチテナント前提は不変 |
| SQLite ストア基盤 (`src/db/store.ts`) | **活かす + 拡張** | Campaign/Contact/Signal/EmailSend/CallAttempt/AssetEvent テーブルを追加 |
| クレジット課金 | **転換** | 「1クレジット=1アポ前払い」→「工程単位の実消費」。`deductCredits` を各ツールから呼ぶ形へ |
| Stripe リンク/Webhook (`src/stripe/`) | **活かす** | 課金モデル確定後そのまま |
| Google Calendar (`src/calendar/`, `src/tools/calendar.ts`) | **活かす** | `schedule_meeting` driver の最初の実装に流用 |
| v2 HTTP サーバー (`src/v2/server.ts`) + stdio proxy (`src/v2/proxy.ts`) | **活かす（必須化）** | 実行ループ＝常駐サーバーの土台。ホットリード監視・Retell連携・Webhook受けをここに乗せる |
| Customer Portal (`src/portal/`) | **縮小・再設計** | 承認ゲートはClaudeチャット側に移管。ポータルは(1)Stripeチャージ (2)結果メトリクス閲覧の読み取り専用に |
| Admin CLI/Web (`src/admin/`) | **そのまま活かす** | 内部運用 |
| i18n (`src/v2/i18n.ts`) | **活かす** | JP/EN |
| `book_appointments` / `check_status` / `get_appointment_details` | **置換** | 新ツール契約（`call_lead` 他）へ。旧3ツールはデモ動画/ピッチで当面残すなら別フラグで温存可 |
| `src/mock/`（フェイク生成） | **当面残す** | 実 driver 未実装の工程をモックで通すため（マイルストーン2）。Retell等の実装が済んだ工程から順に外す |

### 「承認ゲートUI」について（前回の疑問への結論）
旧仕様の「架電前のICP+リスト人間承認ゲート」は、(a) 構成では**専用Webページ不要**。承認はClaudeの会話内で完結する：
```
Claude:「ICP: NYのSeries A fintech CEO。リスト50件生成。
        エンリッチ+メール+コールで約$48消費見込み。承認しますか?」
顧客:「OK、やって」
Claude: → approve_campaign ツール → 実行ループへ引き渡し
```
→ 承認ゲートの"UI"はClaudeのチャットそのもの。ポータルからは承認機能を外す。

---

## 8. v1 スコープ

**In:** 上記ループ全体 / 1データソース / 1シグナル種（求人）/ コールドメール入口 / ホット検知（返信・クリック・フォーム）/ AIコール backend（Retell）/ Notion CRM / カレンダー予約 / 資産ログ / コンプラゲート / 開始生存率の計測 / Claudeチャット上のICP+リスト承認ゲート / クレジット使用量カウンタ（仮単価）。

**Out（後回し）:** 広告チャネル / LinkedIn・SNS / マルチタッチ連番 / マルチシグナル / 人間コール backend（インターフェースのみ）/ 本番の単価確定（実測後）/ 凝ったダッシュボード / Postgres移行。

注：承認ゲートはプロダクトのチェックポイント（金と架電を使う前に顧客が承認）であって Wizard-of-Oz ではない。ゲートの裏の各工程は本当に自動化する。

---

## 9. 推奨インテグレーション（既定値・全部 driver の裏で差し替え可）

| 工程 | v1 既定 | 備考 |
|---|---|---|
| リスト+電話エンリッチ | Apollo もしくは People Data Labs（APIある方1つ） | driver 裏 |
| シグナル（1種） | 求人（採用してる=困ってる）。安く汎用的 | driver 裏 |
| コールドメール送信 | Smartlead/Instantly 等（小規模dogfoodなら最小構成から） | 到達性のため個人Gmail直送は避ける。driver 裏で差替可 |
| ホット検知 | トラッキングリンク=自前リダイレクトendpoint / 返信=受信監視 / フォーム=自前endpoint | 常駐サーバー |
| スクラブ | 電話バリデーション（Twilio Lookup等）+ ローカルサプレッション + 架電時間帯 | driver 裏 |
| コール(AI) | **Retell**（既に使用中） | `AICallDriver` |
| カレンダー | Google Calendar（既存） | `schedule_meeting` |
| CRM | Notion（MCPあり） | `write_crm` |
| 資産ストア | SQLite（v1）→ Postgres（後） | `log_asset` / `query_assets` |

---

## 10. ビルドマイルストーン

1. **骨格**：MCPサーバーに新ツール契約を登録 + driver インターフェース（data/enrich/scrub/email/call/calendar/crm）+ 資産ストアのテーブル追加 + 既存の Notion/Calendar/HTTPサーバー配線を流用。
2. **モックで端から端まで**：mock の data/email/call driver で1キャンペーンを通す（戦略ループと実行ループ、計測の証明）。**承認ゲートをClaudeチャットで通す。**
3. **実 driver を1つずつ差し替え**：list/enrich → scrub → コールドメール送信 + トラッキング → ホット検知 → Retellコール → 予約。
4. **実顧客1社・ICP1つで稼働**：完了条件 = 実在の1アポ取得 + 開始生存率を含む全ファネル指標が取れている。

### ドッグフード ＝ 顧客#1
マイルストーン4の「実顧客1社」は **オーナー(aotoh)自身**。GTM Agent を使って **GTM Agent自身の顧客を取る**。これが本単価決定の前提データを生む。

---

## 11. まだ決めていないこと（実測 / マイルストーン3前）

- 電話番号の発信戦略（発信者ID / ローカルプレゼンス）— 開始生存率に強く効く
- list/enrich の具体ソース確定（Apollo or PDL のどちらをv1で1本にするか）
- クレジット本単価（dogfoodで顧客獲得コストを実測してから）
- 資産ストアの本番置き場（SQLiteのまま行けるところまで / いつPostgresへ）

---

## 12. 判断に迷ったときの原則

- **脳は顧客のClaude、サーバーは道具と常駐実行。** 1手ずつ手動指示させず、フローはツールに用意しつつClaudeに判断させる。
- **driver抽象は核心。** コール backend は必ず差し替え可能に保つ（AI→人間の検証のため）。
- **計測を消すな。** 開始生存率（survived_seconds / hung_up_at_open / reached_pitch）は最重要。
- **コンプラはハードゲート。** コールドコールはしない。AIコールは温かいリード限定。`scrub` を通らなければ架電しない。
- **仕様にない制約を勝手に足さない。** 例：「同一顧客のリクエスト上限」「営業時間外受付拒否」等は明示指示がなければ入れない。
- **実装に迷う事業判断（文面のトーン、課金単価、見せ方）は、コミット前にオーナーに確認。**
