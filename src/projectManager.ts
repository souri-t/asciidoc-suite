import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';

export class ProjectManager {
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    private templates = {
        'technical-document': {
            name: '技術文書',
            description: 'システム仕様書や技術ドキュメント用のテンプレート'
        },
        'manual': {
            name: '操作マニュアル',
            description: 'ユーザーマニュアルや操作手順書用のテンプレート'
        },
        'webapi-document': {
            name: 'WebAPI仕様書',
            description: 'WebAPIの仕様書やドキュメント用のテンプレート'
        }
    };

    async createNewProject(): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('ワークスペースが開かれていません。');
                return;
            }

            // テンプレート選択
            const templateItems = Object.entries(this.templates).map(([key, template]) => ({
                label: template.name,
                description: template.description,
                detail: key
            }));

            const selectedTemplate = await vscode.window.showQuickPick(templateItems, {
                placeHolder: 'プロジェクトテンプレートを選択してください'
            });

            if (!selectedTemplate) {
                return;
            }

            // プロジェクト名入力
            const projectName = await vscode.window.showInputBox({
                prompt: 'プロジェクト名を入力してください',
                value: 'my-asciidoc-project'
            });

            if (!projectName) {
                return;
            }

            // プロジェクトディレクトリ作成
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const projectPath = path.join(workspaceRoot, projectName);

            if (await fs.pathExists(projectPath)) {
                vscode.window.showErrorMessage(`ディレクトリ "${projectName}" は既に存在します。`);
                return;
            }

            await this.createProjectStructure(projectPath, selectedTemplate.detail as string);
            
            vscode.window.showInformationMessage(`プロジェクト "${projectName}" が作成されました。`);
            
            // 作成されたsample.adocを開く
            const samplePath = path.join(projectPath, 'sample.adoc');
            const doc = await vscode.workspace.openTextDocument(samplePath);
            await vscode.window.showTextDocument(doc);

        } catch (error) {
            vscode.window.showErrorMessage(`プロジェクト作成中にエラーが発生しました: ${error}`);
        }
    }

    private async createProjectStructure(projectPath: string, templateKey: string): Promise<void> {
        const templatePath = path.join(this.extensionPath, 'template', templateKey);
        
        // テンプレートディレクトリが存在するかチェック
        if (!await fs.pathExists(templatePath)) {
            throw new Error(`テンプレート "${templateKey}" が見つかりません: ${templatePath}`);
        }

        // テンプレートディレクトリを再帰的にコピー
        await fs.copy(templatePath, projectPath, {
            overwrite: false,
            errorOnExist: false
        });
    }
}
