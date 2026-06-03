# GTM Agent — ビルド仕様（エンジニア引き渡し用 / 確定版 v2: 広告→Speed-to-Lead）

> このドキュメントは LeadClaw の **ピボット後** の仕様です。
> 旧 [HANDOVER.md](HANDOVER.md) は「Claudeに営業を頼める黒箱マネージドサービス（フェイクデモ）」の引継書。
> 本書はそれを置き換える方向性 = **「Claude自身がGTM担当者になる道具箱」** を定義します。
> 矛盾する箇所は本書を優先してください。
>
> **v2での確定事項：入口チャネルはコールドメールではなく「有料広告 → Speed-to-Lead（フォーム入力者に即AIコール）」。**
> コールドメールの産業機械化（ドメイン大量取得・ウォームアップ池・到達性戦争）は**やらない**。運用がカオスになり、製品の核心（AIが温かいリードに架電）とも噛み合わないため。

---

## 0. 一行で

顧客が ICP とオファーを渡すと、**顧客の Claude（Claude Desktop）が GTM担当者の"脳"** として広告キャンペーンを設計・起動し、**広告フォームを埋めた見込み客に常駐サーバーが60秒以内にAIで架電**して資格確認・アポ予約まで一気通貫で回す MCPサーバー（=道具箱）。クレジット従量課金。**脳は顧客のClaude、広告運用と即時架電はサーバー。**

旧版との違い：旧は「裏で人間SDRが動く黒箱」。本版は **「Claudeが広告を指揮し、手を挙げた見込み客にAIが即架電する Speed-to-Lead マシン」**。パイプラインを1手ずつ手動指示させるのではなく、フローはツール側に用意し、Claude自身に判断させる。

### なぜ Speed-to-Lead か
GTMの王道の勝ち筋。**Webで問い合わせた人に5分以内に架電すると、30分後より接続・有効化が約100倍**（Lead Response Management研究）。1分以内が聖杯。人間は24時間1分以内に出られないが、**AIなら出られる**。ここが本製品の唯一無二の核心。

---

## 1. アーキテクチャ：2つのループ

(a) 顧客の Claude Desktop が MCP を叩いてループを回す構成。実行は2層に分かれる。

| | 駆動者 | 役割 | 稼働タイミング |
|---|---|---|---|
| **戦略ループ** | 顧客の Claude Desktop（GTM担当者の"脳"） | ICP/オファー定義・広告ターゲティング設計・広告クリエイティブ/フォーム項目/コール台本の作成・予算と起動の承認・結果レビューと改善 | 顧客がClaudeと会話している時（同期・会話的） |
| **実行ループ** | 常駐 HTTP サーバー（=Speed-to-Leadエンジン） | 広告キャンペーン管理、**リードフォームwebhook受信→60秒以内にAIコール(Retell)**、エンリッチ/スクラブ、予約、クレジット計測、資産ストアへの記録 | 24時間自走（顧客がClaudeを開いていなくても動く。速度が命なのでホットパスにClaudeは入れない） |

### 重要な技術的現実：MCPはサーバー発プッシュができない
「MCP側からClaudeにSkill.md的な定型指示を飛ばす」は、サーバーが任意のタイミングでClaudeに割り込む形では実装できない（MCPは client→server の向きが基本）。代わりに以下で「Claudeを誘導」する：

1. **ツールの返り値に「次にやるべきこと」を埋め込む** ← 主軸
2. **MCP Prompts 機能**で定型ワークフローのテンプレを提供
3. **ツールの description** に振る舞いの指針を書く

→ 帰結：**Speed-to-Leadの即時架電はClaudeを起こさずサーバーが自走でやる**。Claudeは次に顧客が会話を開いた時に `query_assets` / `get_campaign_metrics` で結果を知り、戦略を調整する。これが「実行ループは常駐必須」の根拠。

---

## 2. 確定ファネル（v1）

```
① define_campaign（ICP・オファー・広告ターゲティング・日予算・コール台本・同意/コンプラ制約）
② Claudeが設計：広告クリエイティブ + リードフォーム項目 + コール台本（脳のLLM推論、任意でツール化）
③【人間承認ゲート：Claudeのチャット上で「このターゲットに$X/日、この台本でAI架電。承認?」を顧客が承認】
④ launch_campaign（Meta/LinkedIn/Google の Marketing API でキャンペーン起動）
─────────────── ここから常駐サーバーが自走（Claude不在でOK）───────────────
⑤ リードフォーム入力 → webhook が即着弾（lead_id 生成）
⑥ enrich_lead（架電前に文脈付与）→ scrub_lead（有効番号 / 同意 / 営業時間 / 抑制）   ← ハードゲート
⑦ call_lead（60秒以内にRetellが架電 / Speed-to-Lead）                              ← PLUGGABLE backend / 計測必須
⑧ AIが資格確認 + アポ確定 → schedule_meeting（Calendar）+ write_crm（Notion）
⑨ log_asset（CPL・接続率・予約率・survived_seconds・1アポ単価を記録）
─────────────────────────────────────────────────────────
⑩ Claudeが get_campaign_metrics でレビュー → ターゲティング/台本/予算を調整（学習ループ）
```

### コンプラ方針（確定・ここだけは手を抜かない）
opt-inインバウンドなので圧倒的に綺麗。ただしゼロではない：

- **広告のリードフォームに同意チェックボックスを必須化**：「送信により、AI自動音声を含む電話連絡を受けることに同意します」。米TCPAでAI音声は人工/録音音声扱い＝マーケ電話には事前の書面同意が要る。**この一行が全ての法的支柱。**
- **コール冒頭でAIであることを開示**（推奨／事実上の標準化の流れ）。
- **リードのタイムゾーンで営業時間ゲート**、オプトアウト尊重、自社抑制リスト。
- `call_lead` は `scrub_lead(lead_id).callable == true` でない限り**必ず拒否**（同意なし・無効番号・時間外・抑制対象を弾く法的ゲート）。

---

## 3. MCPツール契約（v2: 広告→Speed-to-Lead）

「リストを作って所有する」が消え、「オーディエンスを定義して広告に探させる」に変わるため、cold版より簡潔。

```
# --- セットアップ（phase1から再利用）---
configure_account(company_info, icp, offer, defaults)        -> ok
get_account_info()                                           -> { settings, credits, balance }

# --- キャンペーン設計（Claudeが脳として設計）---
define_campaign(icp, offer, ad_targeting, daily_budget, constraints) -> campaign_id
    # constraints: geos[], call_hours, consent_required(=true固定), suppression[], platform
generate_ad_creative(campaign_id)  -> { headline, body, image_brief, form_questions }   # 脳の推論でも可
generate_call_script(campaign_id)  -> { opener, ai_disclosure, qualification_questions, booking_flow }

# --- 起動・制御（承認ゲート通過後）---
launch_campaign(campaign_id)       -> { ad_campaign_id, status }   # AdDriver (Meta v1)
pause_campaign(campaign_id)        -> ok
adjust_budget(campaign_id, daily_budget) -> ok

# --- 実行ループ（常駐サーバーが自動実行。下記はClaudeが検査/再実行できるよう公開）---
# リードフォームwebhook → enrich_lead → scrub_lead → call_lead を60秒以内に自走
enrich_lead(lead_id)               -> { phone, email, title, account, context }
scrub_lead(lead_id)                -> { callable: bool, reasons[] }                # HARD GATE
call_lead(lead_id)
    -> { outcome, survived_seconds, reached_pitch, hung_up_at_open,
         appointment?, transcript }                                               # PLUGGABLE / 計測必須

# --- 出力・記録 ---
schedule_meeting(appointment)      -> calendar_event_id    # Google Calendar（既存再利用）
write_crm(record)                  -> crm_ref              # Notion（MCPあり）
log_asset(event)                   -> ok                   # 資産ストア
query_assets(query)                -> rows                 # 脳が改善に使う

# --- モニタリング（Claudeがレビュー）---
get_campaign_metrics(campaign_id)  -> { spend, leads, connect_rate, booked, cost_per_meeting, ... }
get_leads(campaign_id, filter)     -> [lead]
```

### 絶対に外せない設計原則 3つ（最適化で消すな）

**① コール工程は差し替え可能なバックエンドにする（`CallDriver`）**
`call_lead(...)` は1つのインターフェースの裏で driver を差し替えられること。
- v1 は `AICallDriver`（Retell）を実装。
- `HumanCallDriver`（人間SDRディスパッチキュー）を**他工程を一切変えずに後から差し込める**こと。v1ではインターフェース定義＋スタブのみ。
- 理由：「AIが温かいリードに架電してアポを取れるか」が本製品核心の未知数。まずAIで試す。ダメなら人間SDRにこの1コンポーネントだけ差し替える。

**② 広告プラットフォームも差し替え可能にする（`AdDriver`）**
`launch_campaign` / フォームwebhook受信は `AdDriver` の裏に抽象化。
- v1 は **`MetaLeadAdsDriver`**（Meta Lead Ads。leadgen webhookが即着弾し最安でテスト可）。
- `LinkedInLeadGenDriver`（B2Bターゲ精度が最良＝ICPに最適、CPL高）、`GoogleAdsDriver` を後から差し替え。
- プラットフォーム選択がハードな作り直しにならないように。

**③ 「どこでコールが死んだか」を必ず計測する**
全コール試行が最低限これを記録：`outcome`, `survived_seconds`, `reached_pitch`(bool), `hung_up_at_open`(bool), `transcript`。
- 重要指標はアポ率だけでなく**開始の生存率**。「冒頭で切られた（関与失敗）」と「喋れたが取れなかった（転換失敗）」を区別できないと改善判断ができない。
- 温かいリードへの架電なので生存率は元から高めだが、指標としては引き続き有効。

---

## 4. データモデル（最小）

```
Campaign       { id, account_id, icp, offer, ad_targeting, daily_budget, constraints, ad_campaign_id, status }
                 # constraints: geos[], call_hours, consent_required, suppression[], platform
Lead           { id, campaign_id, name, title, company, phone, email, consent: bool,
                 source_platform, form_submitted_at, scrub_status, status }
CallAttempt    { lead_id, backend, outcome, survived_seconds, reached_pitch, hung_up_at_open, transcript, ts }
Appointment    { lead_id, when, calendar_event_id, status }
AssetEvent     { campaign_id, lead_id, stage, cost, signal, outcome, ts }   # ← 学習の飛輪の行
AdAccount      { account_id, platform, oauth_tokens?, managed_by_us: bool } # 将来のOAuth用
```

---

## 5. ストア構成（2つに分ける。混ぜない）

| ストア | 用途 | 実装 |
|---|---|---|
| **Notion** | 人間が読むCRM（リード/結果/アポ） | Notion MCP（接続済み） |
| **資産ストア** | オーケストレーター（脳）が集計クエリして改善に使う構造化DB。学習の飛輪＝第二のモート | **SQLite（v1、既存の `better-sqlite3` 基盤を流用）→ Postgres（後）** |

同期方向：全イベントは資産ストアに append-only。そのサブセット（顧客が読みたい粒度）を Notion にミラー。資産ストアは機械集計専用。

---

## 6. クレジット課金（方針確定・単価は実測後）

- クレジット従量制は維持。ただし**「1クレジット=1アポ前払い」から「パイプライン各工程で実消費」へ転換**。
- **クレジットの主な行き先は広告費**（infraではない）。広告費パススルー + 接続コール課金 + マージン。
- 経済性の現実（誤魔化さない）：

```
Meta例: CPL $30 ÷（接続率60% × 予約率30%）≒ $167 / 確定アポ
LinkedIn: $400+/アポ もあり得る
```

- これは負けではない。SDRエージェンシーは月$3,000〜10,000リテイナーで月10-20アポ＝1アポ$150〜1,000＋管理工数。我々は**$167で、完全自動・温かい・ICPドンピシャ・本人が手を挙げた**アポ。創業者は普通に払う。
- **顧客にはダッシュボードで「1確定アポ単価」を透明表示**。「$50/アポ」固定ではない。
- **v1は仮単価で置く。** オーナー(aotoh)が自分で実行し、顧客獲得コストを実測してから本単価を決める。
- 実装：phase1 の Stripe ペイメントリンク + Webhook + クレジット残高基盤を流用。**減算ロジックを `book.ts` の「アポ単位・前払い」から各工程の「実消費」へ分散**。

---

## 7. friend の `feat/phase1` からの再利用マップ

| コンポーネント | 扱い | メモ |
|---|---|---|
| API key 認証 / アカウント分離 (`src/auth.ts`) | **そのまま活かす** | マルチテナント前提は不変 |
| SQLite ストア基盤 (`src/db/store.ts`) | **活かす + 拡張** | Campaign/Lead/CallAttempt/Appointment/AssetEvent/AdAccount テーブルを追加 |
| クレジット課金 | **転換** | 「1クレジット=1アポ前払い」→「工程単位の実消費（主に広告費）」 |
| Stripe リンク/Webhook (`src/stripe/`) | **活かす** | 課金モデル確定後そのまま |
| Google Calendar (`src/calendar/`, `src/tools/calendar.ts`) | **活かす** | `schedule_meeting` driver の最初の実装に流用 |
| v2 HTTP サーバー (`src/v2/server.ts`) + stdio proxy (`src/v2/proxy.ts`) | **活かす（必須化）** | 実行ループ＝Speed-to-Leadエンジンの土台。広告webhook受け・Retell架電・予約をここに乗せる |
| Customer Portal (`src/portal/`) | **縮小・再設計** | 承認ゲートはClaudeチャットへ移管。ポータルは(1)Stripeチャージ (2)結果メトリクス（CPL/接続率/1アポ単価）の読み取り専用に |
| Admin CLI/Web (`src/admin/`) | **そのまま活かす** | 内部運用。広告アカウント/Twilio番号の管理もここに |
| i18n (`src/v2/i18n.ts`) | **活かす** | JP/EN |
| `book_appointments` / `check_status` / `get_appointment_details` | **置換** | 新ツール契約へ。旧3ツールはデモ動画/ピッチで当面残すなら別フラグで温存可 |
| `src/mock/`（フェイク生成） | **当面残す** | 実 driver 未実装の工程をモックで通すため（マイルストーン2）。実装が済んだ工程から順に外す |

### 「承認ゲートUI」について
旧仕様の「金と架電を使う前の人間承認ゲート」は、(a) 構成では**専用Webページ不要**。承認はClaudeの会話内で完結する：
```
Claude:「ICP: NYのSeries A fintech CEO。Metaに$50/日、想定CPL $30、AI架電台本はこれ。
        月見込み: リード〜50件 / 接続〜30件 / アポ〜9件 / 1アポ単価〜$167。承認しますか?」
顧客:「OK、やって」
Claude: → launch_campaign → 実行ループへ
```
→ 承認ゲートの"UI"はClaudeのチャットそのもの。ポータルからは承認機能を外す。

---

## 8. 広告アカウントの所有（確定）

- **v1（ドッグフード）**：**我々のマスター広告アカウント**で運用（オーナー(aotoh)自身が顧客#1なので最速）。
- **将来**：各顧客が自分の広告アカウントを **OAuth接続**（Meta/Google/LinkedIn いずれもMarketing APIのOAuth対応）。`AdAccount` テーブルと `AdDriver` は最初からこの将来形を見据えた形にしておく（v1ではmanaged固定、トークン欄は空でよい）。

---

## 9. v1 スコープ

**In:** 上記ループ全体 / 広告1プラットフォーム（Meta）/ リードフォーム + 同意取得 / Speed-to-Lead即時AIコール（Retell, 60秒以内）/ enrich + scrub ハードゲート / Notion CRM / カレンダー予約 / 資産ログ / 開始生存率の計測 / Claudeチャット上の予算+台本承認ゲート / クレジット使用量カウンタ（仮単価）/ 我々のマスター広告アカウント運用。

**Out（後回し）:** コールドメール（産業機械化は明確にやらない）/ LinkedIn・Google広告driver（インターフェースのみ）/ 顧客のOAuth広告アカウント接続（設計は見据えるが実装は後）/ 人間コール backend（インターフェースのみ）/ 本番単価確定（実測後）/ マルチプラットフォーム同時運用 / Postgres移行 / 凝ったダッシュボード。

注：承認ゲートはプロダクトのチェックポイント（金と架電を使う前に顧客が承認）であって Wizard-of-Oz ではない。ゲートの裏の各工程は本当に自動化する。

---

## 10. 推奨インテグレーション（既定値・全部 driver の裏で差し替え可）

| 工程 | v1 既定 | driver | 備考 |
|---|---|---|---|
| 広告/リードフォーム | **Meta Lead Ads**（leadgen webhook即着弾・最安テスト） | `AdDriver` | LinkedIn(B2B精度最良/高CPL)・Google検索(高intent)は後 |
| リードエンリッチ | Apollo / People Data Labs（フォーム情報を補完） | `EnrichDriver` | 架電前に企業文脈を付与 |
| スクラブ | Twilio Lookup（番号検証）+ 同意確認 + 営業時間 + 抑制リスト | `ScrubDriver` | ハードゲート |
| コール(AI) | **Retell**（使用中） | `CallDriver`=`AICallDriver` | 温かいリードに60秒以内 |
| 発信番号 | Twilio（ローカルプレゼンス・Scam Likely対策） | — | STIR/SHAKEN登録・番号ローテ |
| カレンダー | Google Calendar（既存） | `CalendarDriver` | `schedule_meeting` |
| CRM | Notion（MCPあり） | `CrmDriver` | `write_crm` |
| 資産ストア | SQLite（v1）→ Postgres（後） | — | `log_asset` / `query_assets` |

---

## 11. ビルドマイルストーン

1. **骨格**：MCPサーバーに新ツール契約を登録 + driver インターフェース（Ad/Enrich/Scrub/Call/Calendar/Crm）+ 資産ストアのテーブル追加 + 既存の Notion/Calendar/HTTPサーバー配線を流用。
2. **モックで端から端まで**：mock の Ad/Call driver で1キャンペーンを通す（戦略ループ＋実行ループ＋計測の証明）。**フォームwebhook→60秒架電→予約をモックで一周。承認ゲートをClaudeチャットで通す。**
3. **実 driver を1つずつ差し替え**：Meta広告起動 + リードフォームwebhook → enrich → scrub → Retell架電 → 予約。
4. **実顧客1社・ICP1つで稼働**：完了条件 = 実在の1アポ取得 + 開始生存率・CPL・1アポ単価を含む全ファネル指標が取れている。

### ドッグフード ＝ 顧客#1
マイルストーン4の「実顧客1社」は **オーナー(aotoh)自身**。GTM Agent を使って **GTM Agent自身の顧客を取る**。これが本単価決定の前提データを生む。最初の数顧客はローンチ(Reddit/HN/X)＋低volumeで取り、産業機械は作らない。

---

## 12. まだ決めていないこと（実測 / マイルストーン3前）

- 発信番号戦略（ローカルプレゼンス / Scam Likely回避 / 番号ローテーション）— 開始生存率に強く効く
- enrich の具体ソース確定（Apollo or PDL のどちらをv1で1本にするか）
- リードフォームのホスト（Metaネイティブフォーム vs 自前LP+フォーム）
- クレジット本単価（dogfoodで顧客獲得コストを実測してから）
- 資産ストアの本番置き場（SQLiteのまま行けるところまで / いつPostgresへ）

---

## 13. 判断に迷ったときの原則

- **脳は顧客のClaude、サーバーは広告運用と即時架電。** 1手ずつ手動指示させず、フローはツールに用意しつつClaudeに判断させる。
- **driver抽象は核心。** コール backend（AI→人間）と広告 backend（Meta→LinkedIn/Google）は必ず差し替え可能に保つ。
- **計測を消すな。** 開始生存率（survived_seconds / hung_up_at_open / reached_pitch）+ CPL + 1アポ単価は最重要。
- **コンプラはハードゲート。** コールドコールはしない。AIコールはフォームで同意した温かいリード限定。`scrub_lead` を通らなければ架電しない。同意チェックボックスは絶対。
- **産業機械化しない。** コールドメールのドメイン大量取得・ウォームアップ池は作らない（カオスになる）。
- **仕様にない制約を勝手に足さない。** 例：「同一顧客のキャンペーン数上限」等は明示指示がなければ入れない。
- **実装に迷う事業判断（広告コピーのトーン、課金単価、見せ方）は、コミット前にオーナーに確認。**
