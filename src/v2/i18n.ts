export type Lang = "ja" | "en";

export function getLang(cookieHeader?: string): Lang {
  return (cookieHeader ?? "").includes("lc_lang=en") ? "en" : "ja";
}

const S = {
  // Nav
  dashboard:       { ja: "ダッシュボード",        en: "Dashboard" },
  allRequests:     { ja: "全リクエスト",           en: "All Requests" },
  newAccount:      { ja: "+ 新規アカウント",        en: "+ New Account" },
  backToAdmin:     { ja: "← 管理画面",             en: "← Admin" },
  adminPanel:      { ja: "管理画面",               en: "Admin" },
  portal:          { ja: "ポータル",               en: "Portal" },

  // Status
  active:          { ja: "有効",                   en: "Active" },
  invited:         { ja: "招待済み",               en: "Invited" },
  pending:         { ja: "未設定",                 en: "Pending" },

  // Credits
  credits:         { ja: "クレジット",              en: "Credits" },
  available:       { ja: "利用可能",               en: "Available" },
  reserved:        { ja: "予約中",                 en: "Reserved" },
  addCredits:      { ja: "クレジット追加",          en: "Add Credits" },
  setCredits:      { ja: "クレジット設定",          en: "Set Credits" },
  totalCredits:    { ja: "合計クレジット",          en: "Total Credits" },

  // Accounts
  accounts:        { ja: "アカウント",              en: "Accounts" },
  company:         { ja: "会社名",                  en: "Company" },
  email:           { ja: "メールアドレス",           en: "Email" },
  status:          { ja: "ステータス",              en: "Status" },
  actions:         { ja: "操作",                   en: "Actions" },
  apiKey:          { ja: "API キー",               en: "API Key" },
  createAccount:   { ja: "アカウント作成",          en: "Create Account" },
  companyName:     { ja: "会社名 *",               en: "Company Name *" },
  customerEmail:   { ja: "顧客メールアドレス *",    en: "Customer Email *" },
  icp:             { ja: "ICP（理想顧客プロファイル）", en: "ICP (Ideal Customer Profile)" },
  industry:        { ja: "デフォルト業界",          en: "Default Industry" },
  targetRole:      { ja: "デフォルトターゲット役職", en: "Default Target Role" },
  initialCredits:  { ja: "初期クレジット",          en: "Initial Credits" },
  companyInfo:     { ja: "会社・製品の説明",        en: "Company / Product Description" },
  cancel:          { ja: "キャンセル",              en: "Cancel" },
  view:            { ja: "詳細",                   en: "View" },
  accountInfo:     { ja: "アカウント情報",          en: "Account Info" },
  created:         { ja: "作成日",                 en: "Created" },
  activated:       { ja: "有効化日",               en: "Activated" },
  shareViaPortal:  { ja: "ポータルまたはメールで顧客へ共有。Claude Desktop の設定に使用。", en: "Share via portal or email. Customer adds this to Claude Desktop config." },

  // Requests
  requestId:       { ja: "リクエスト ID",          en: "Request ID" },
  location:        { ja: "場所",                   en: "Location" },
  count:           { ja: "件数",                   en: "Count" },
  confirmed:       { ja: "確定数",                 en: "Confirmed" },
  date:            { ja: "日付",                   en: "Date" },
  refund:          { ja: "返金",                   en: "Refund" },
  consume:         { ja: "消費確定",               en: "Consume" },
  creditStatus:    { ja: "クレジット状態",          en: "Credit Status" },
  noRequests:      { ja: "まだ予約リクエストはありません。", en: "No booking requests yet." },

  // Payment
  paymentLink:     { ja: "支払いリンク生成",        en: "Generate Payment Link" },
  plan:            { ja: "プラン",                 en: "Plan" },
  amount:          { ja: "金額",                   en: "Amount" },
  url:             { ja: "URL",                    en: "URL" },
  paymentNote:     { ja: "顧客へ送付後、入金確認次第手動でクレジットを追加してください。", en: "Send this link to the customer. Manually add credits after payment is confirmed." },
  noStripeKey:     { ja: "STRIPE_SECRET_KEY を設定すると支払いリンクを生成できます。", en: "Set STRIPE_SECRET_KEY to enable payment link generation." },

  // Flash
  accountCreated:  { ja: "アカウントを作成しました！API キー:", en: "Account created! API key:" },
  creditsUpdated:  { ja: "クレジットを更新しました。",          en: "Credits updated." },
  creditsRefunded: { ja: "クレジットを返金しました。",          en: "Credits refunded." },

  // Stats
  totalAccounts:   { ja: "アカウント数",            en: "Accounts" },
  activeAccounts:  { ja: "有効数",                 en: "Active" },
  totalRequests:   { ja: "リクエスト数",            en: "Requests" },

  // Validation
  requiredFields:  { ja: "会社名とメールアドレスは必須です。", en: "Company name and email are required." },

  // Portal
  welcomeTitle:    { ja: "LeadClaw へようこそ",    en: "Welcome to LeadClaw" },
  welcomeSubtitle: { ja: "AI が動かし、人間が届ける営業アポ自動化サービス", en: "AI-powered sales appointment booking, delivered by humans" },
  enterApiKey:     { ja: "API キーを入力してアカウントを表示", en: "Enter your API key to view your account" },
  yourApiKey:      { ja: "API キー",               en: "Your API Key" },
  viewAccount:     { ja: "アカウントを表示 →",      en: "View Account →" },
  invalidApiKey:   { ja: "API キーが無効です。確認してから再度お試しください。", en: "Invalid API key. Please check and try again." },
  tryAgain:        { ja: "← もう一度試す",          en: "← Try Again" },
  myAccount:       { ja: "マイアカウント",          en: "My Account" },
  setupInstructions: { ja: "Claude Desktop セットアップ手順", en: "Claude Desktop Setup" },
  step1:           { ja: "Claude Desktop を開く → 設定 → 開発者 → 設定を編集", en: "Open Claude Desktop → Settings → Developer → Edit Config" },
  step2:           { ja: "以下を claude_desktop_config.json に貼り付け:", en: "Paste this into claude_desktop_config.json:" },
  step3:           { ja: "ファイルを保存して Claude Desktop を再起動",  en: "Save the file and restart Claude Desktop" },
  step4:           { ja: "Claudeに話しかける：「サンフランシスコのCEO向けにアポを3件入れて」", en: "Ask Claude: \"Book me 3 sales appointments in San Francisco targeting CEO\"" },
  changePassword:  { ja: "パスワード変更",          en: "Change Password" },
  setPasswordTitle:{ ja: "パスワードを設定してください",         en: "Set Your Password" },
  setPasswordSub:  { ja: "LeadClaw アカウントを保護するパスワードを設定します。", en: "Set a password to secure your LeadClaw account." },
  password:        { ja: "パスワード",              en: "Password" },
  confirmPassword: { ja: "パスワード（確認）",       en: "Confirm Password" },
  setPasswordBtn:  { ja: "パスワードを設定して API キーを表示 →", en: "Set Password & View API Key →" },
  currentPassword: { ja: "現在のパスワード",        en: "Current Password" },
  newPassword:     { ja: "新しいパスワード",        en: "New Password" },
  confirmNew:      { ja: "新しいパスワード（確認）", en: "Confirm New Password" },
  updatePassword:  { ja: "パスワードを更新",        en: "Update Password" },
  backToAccount:   { ja: "← アカウントに戻る",      en: "← Back to Account" },
  pwTooShort:      { ja: "パスワードは8文字以上で入力してください。", en: "Password must be at least 8 characters." },
  pwMismatch:      { ja: "パスワードが一致しません。",              en: "Passwords do not match. Please try again." },
  pwWrong:         { ja: "現在のパスワードが正しくありません。",    en: "Current password is incorrect." },
  pwUpdated:       { ja: "パスワードを更新しました。",              en: "Password updated successfully." },
} as const;

type Key = keyof typeof S;

export function t(key: Key, lang: Lang): string {
  return S[key][lang];
}
