import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { BuildManager } from './buildManager';

export class AsciidocSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'asciidocActions';

    private _view?: vscode.WebviewView;
    private projectManager: ProjectManager;
    private buildManager: BuildManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        projectManager: ProjectManager,
        buildManager: BuildManager
    ) {
        this.projectManager = projectManager;
        this.buildManager = buildManager;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'createProject':
                    await this.projectManager.createNewProject();
                    break;
                case 'buildHtml':
                    await this.buildManager.buildHtml();
                    break;
                case 'exportArchive':
                    await this.buildManager.exportArchive();
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Asciidoc Suite</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 16px;
                    margin: 0;
                }
                
                .section {
                    margin-bottom: 24px;
                }
                
                .section-title {
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 12px;
                    color: var(--vscode-foreground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 4px;
                }
                
                .description {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 12px;
                    line-height: 1.4;
                }
                
                .action-button {
                    display: block;
                    width: 100%;
                    padding: 8px 12px;
                    margin-bottom: 8px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    font-size: 13px;
                    font-family: var(--vscode-font-family);
                    text-align: left;
                }
                
                .action-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .action-button:active {
                    background-color: var(--vscode-button-background);
                    transform: translateY(1px);
                }
                
                .icon {
                    margin-right: 8px;
                    opacity: 0.8;
                }
                
                .help-text {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    margin-top: 16px;
                    padding: 8px;
                    background-color: var(--vscode-textBlockQuote-background);
                    border-left: 3px solid var(--vscode-textBlockQuote-border);
                }
            </style>
        </head>
        <body>
            <div class="section">
                <div class="section-title">プロジェクト管理</div>
                <div class="description">
                    新しいAsciidocプロジェクトを作成します。テクニカルドキュメントまたはマニュアル用のテンプレートを選択できます。
                </div>
                <button class="action-button" onclick="createProject()">
                    <span class="icon">📁</span>新規プロジェクト作成
                </button>
            </div>
            
            <div class="section">
                <div class="section-title">ビルド</div>
                <div class="description">
                    AsciidocファイルをHTMLに変換します。Dockerコンテナを使用して安全にビルドが実行されます。
                </div>
                <button class="action-button" onclick="buildHtml()">
                    <span class="icon">🔨</span>HTMLビルド
                </button>
            </div>
            
            <div class="section">
                <div class="section-title">エクスポート</div>
                <div class="description">
                    ビルド成果物をZIPアーカイブとしてエクスポートします。配布や共有に便利です。
                </div>
                <button class="action-button" onclick="exportArchive()">
                    <span class="icon">📦</span>アーカイブエクスポート
                </button>
            </div>
            
            <div class="help-text">
                💡 ヒント: 各機能はコマンドパレット（Ctrl+Shift+P）からも実行できます。「Asciidoc」で検索してください。
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function createProject() {
                    vscode.postMessage({
                        type: 'createProject'
                    });
                }
                
                function buildHtml() {
                    vscode.postMessage({
                        type: 'buildHtml'
                    });
                }
                
                function exportArchive() {
                    vscode.postMessage({
                        type: 'exportArchive'
                    });
                }
            </script>
        </body>
        </html>`;
    }
}
