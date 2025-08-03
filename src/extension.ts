import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { BuildManager } from './buildManager';
import { AsciidocSidebarProvider } from './sidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Asciidoc Suite が起動されました');

    // プロバイダーとマネージャーの初期化
    const projectManager = new ProjectManager(context.extensionPath);
    const buildManager = new BuildManager();

    // サイドバープロバイダーの登録
    const sidebarProvider = new AsciidocSidebarProvider(context.extensionUri, projectManager, buildManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(AsciidocSidebarProvider.viewType, sidebarProvider)
    );

    // コマンドの登録
    const commands = [
        // プロジェクト作成
        vscode.commands.registerCommand('asciidocSuite.createProject', async () => {
            await projectManager.createNewProject();
        }),

        // PDF ビルド
        vscode.commands.registerCommand('asciidocSuite.buildPdf', async () => {
            await buildManager.buildPdf();
        }),

        // アーカイブエクスポート
        vscode.commands.registerCommand('asciidocSuite.exportArchive', async () => {
            await buildManager.exportArchive();
        })
    ];

    // すべてのコマンドをコンテキストに追加
    commands.forEach(command => context.subscriptions.push(command));

    // ワークスペースにAsciidocファイルがあるかチェック
    checkWorkspaceForAsciidocFiles();
}

async function checkWorkspaceForAsciidocFiles() {
    const files = await vscode.workspace.findFiles('**/*.adoc', '**/node_modules/**', 10);
    if (files.length > 0) {
        vscode.commands.executeCommand('setContext', 'workspaceHasAsciidocFiles', true);
    }
}

export function deactivate() {
    console.log('Asciidoc Suite が非活性化されました');
}
