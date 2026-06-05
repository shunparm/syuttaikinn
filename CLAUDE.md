# プロジェクト方針

## システム概要
出退勤管理アプリ（このリポジトリ）と給与計算システムを連携させ、事務員の手作業を削減することを目的とする。

## ID統一方針（最重要）
- **作業員ID・現場IDはすべて給与計算システムのIDに統一する**
- アプリ固有のIDは持たない。給与計算システムで使われているIDをそのままアプリにも入力する
- アプリで出力したデータ（CSVなど）が手作業なしで給与計算システムに反映できる状態を目指す
- 新機能を追加する際も、給与計算システムとの連携を前提に設計すること

## 技術スタック
- フロントエンド: React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- バックエンド: Express.js + tRPC
- DB: PostgreSQL（Supabase本番）+ Drizzle ORM
- 認証: PIN認証（作業員）/ パスワード認証（管理者・スタッフ）

## ブランチ運用
- 開発ブランチ: `claude/add-leave-request-feature-eRDZ4`
- mainへのマージで本番（Supabase + デプロイ先）に自動反映

## DBマイグレーション
`server/db.ts` の `initDb()` に直接SQL記述。アプリ起動時に実行される。
カラム追加・削除は `ALTER TABLE ... ADD/DROP COLUMN IF EXISTS` で冪等に記述すること。
