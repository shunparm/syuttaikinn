# 出退勤管理アプリ TODO

## Phase 1: DBスキーマ・マイグレーション
- [x] drizzle/schema.ts に employeeMaster テーブル追加
- [x] drizzle/schema.ts に siteMaster テーブル追加
- [x] drizzle/schema.ts に attendanceRecords テーブル追加
- [x] drizzle/schema.ts に correctionRequests テーブル追加
- [x] マイグレーションSQL生成・実行

## Phase 2: バックエンド（tRPCルーター）
- [x] server/routers/master.ts: 作業員CRUD・現場CRUD
- [x] server/routers/attendance.ts: 出勤・退勤・稼働中一覧・記録取得
- [x] server/routers/correction.ts: 訂正申請CRUD・承認・却下
- [x] server/routers/export.ts: CSV出力用データ取得
- [x] server/routers.ts にルーター統合

## Phase 3: フロントエンド基盤・デザイン
- [x] index.css グローバルテーマ設定（建設業向けエレガントカラー・OKLCH）
- [x] DashboardLayout カスタマイズ（サイドバーナビゲーション・リサイズ対応）
- [x] App.tsx ルーティング設定（全9ルート）
- [x] ロールベースアクセス制御（admin/user）

## Phase 4: 全画面実装
- [x] ダッシュボード（Home.tsx）: KPI・稼働中人数・本日出勤数
- [x] 作業員管理ページ（admin専用）: 一覧・登録・編集
- [x] 工事現場管理ページ（admin専用）: 一覧・登録・編集
- [x] 出勤打刻ページ: 作業員・現場選択・同行者選択
- [x] 退勤打刻ページ: 稼働中作業員選択・業務報告・退勤
- [x] 稼働中一覧ページ: リアルタイム表示（30秒自動更新）
- [x] 出退勤簿一覧ページ: 日付・作業員・現場フィルタ
- [x] 訂正申請ページ: 申請作成・一覧
- [x] 訂正申請管理ページ（admin専用）: 承認・却下ワークフロー
- [x] CSV出力ページ: 期間・作業員指定・集計サマリー・BOM付きCSV

## 追加機能
- [x] 複数管理者設定：管理者がユーザー一覧を閲覧し、役割（admin/user）を変更できる管理画面を追加

## Phase 5: テスト・品質
- [x] Vitestテスト作成（12テスト全パス）
- [x] 認証フロー・ロールベースアクセス制御テスト
- [x] バリデーション・CSV出力テスト
- [x] チェックポイント保存
