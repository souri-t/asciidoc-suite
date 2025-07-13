# Asciidoc Suite

VSCode拡張機能「Asciidoc Suite」は、Asciidoc文書の執筆から出力まで一貫したワークフローを提供する統合開発環境です。

## 機能

### プロジェクト作成機能
- **新規プロジェクト作成**: 事前定義されたテンプレートから選択できます。
  - **テンプレート**: 技術文書、マニュアル

### ビルド機能
- **HTML出力**: Dockerコンテナを使用したAsciidoctorによるHTML生成
- **図表サポート**: PlantUMLやDraw.io図表の文書内の貼り付け
- **カスタムスタイル**: CSSスタイルシートの適用

### 出力管理機能
- **アーカイブエクスポート**: ビルド成果物をZIPファイルとしてエクスポート

## 使用方法

### サイドバーからの実行
1. **アクティビティバー**の📖ブックアイコンをクリックして「Asciidoc Suite」サイドバーを開く
2. **アクション**から各機能を実行：
   - **📁 新規プロジェクト作成**: テンプレートから文書を生成する。
   - **🔨 HTMLビルド**: AsciidocファイルをHTMLに変換する（Dockerコンテナを使用）。
   - **📦 アーカイブエクスポート**: ビルド成果物をZIPファイルとしてエクスポートする。

### コマンドパレットからの実行
\`Ctrl+Shift+P\`（macOS: \`Cmd+Shift+P\`）でコマンドパレットを開き、「Asciidoc」で検索：
- \`Asciidoc: Create New Project\`
- \`Asciidoc: Build HTML\`
- \`Asciidoc: Export Archive\`

## 前提条件

- **Docker**: この拡張機能はDockerコンテナを使用してAsciidoctorを実行します。
- **asciidoctor/docker-asciidoctor**: 初回ビルド時に自動的にコンテナイメージをダウンロードします。

## プロジェクト構造

新規プロジェクト作成時に以下の構造が自動生成されます：

```
project-name/
├── index.adoc          # メインドキュメント
├── style.css           # スタイルシート
├── components/         # コンポーネントファイル
│   ├── 100_background.adoc
│   ├── 200_architecture.adoc
│   ├── 300_function.adoc
│   ├── 400_screen.adoc
│   └── 500_glossary.adoc
├── images/             # 画像ファイル
└── output/             # ビルド後の出力フォルダ
```

## 設定

VS Codeの設定から以下をカスタマイズできます：

### ビルド設定
- \`asciidocSuite.build.outputFormat\`: 出力形式の設定
- \`asciidocSuite.build.stylesheet\`: 使用するスタイルシートファイル
- \`asciidocSuite.build.stylesheetPath\`: スタイルシートの検索方法
- \`asciidocSuite.build.enableDiagrams\`: 図表機能の有効/無効
- \`asciidocSuite.build.useDocker\`: Dockerコンテナの使用（推奨）
- \`asciidocSuite.build.dockerImage\`: 使用するAsciidoctor Dockerイメージ
- \`asciidocSuite.build.outputDirectory\`: 出力ディレクトリ

## システム要件

- VS Code 1.74.0 以上
- Docker Desktop（推奨）

## ライセンス

MIT License
