import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BuildManager {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Asciidoc Build');
    }

    // Dockerの可用性をチェック
    private async checkDockerAvailability(): Promise<boolean> {
        try {
            const { stdout } = await execAsync('docker --version');
            this.outputChannel.appendLine(`Docker検出: ${stdout.trim()}`);
            return true;
        } catch (error) {
            this.outputChannel.appendLine(`Dockerが見つかりません: ${error}`);
            vscode.window.showErrorMessage(
                'Dockerが見つかりません。この拡張機能を使用するにはDockerが必要です。',
                '詳細情報'
            ).then(selection => {
                if (selection === '詳細情報') {
                    vscode.env.openExternal(vscode.Uri.parse('https://docs.docker.com/get-docker/'));
                }
            });
            return false;
        }
    }

    // Asciidoctor Dockerイメージの取得を確認
    private async ensureAsciidoctorImage(): Promise<boolean> {
        try {
            this.outputChannel.appendLine('Asciidoctor Dockerイメージを確認中...');
            
            // イメージが既に存在するかチェック
            const { stdout } = await execAsync('docker images asciidoctor/docker-asciidoctor --format "{{.Repository}}"');
            
            if (stdout.trim()) {
                this.outputChannel.appendLine('Asciidoctor Dockerイメージが利用可能です。');
                return true;
            }

            // イメージが存在しない場合、プルを提案
            const pullImage = await vscode.window.showInformationMessage(
                'Asciidoctor Dockerイメージが必要です。ダウンロードしますか？（初回のみ、数分かかる場合があります）',
                'はい',
                'いいえ'
            );

            if (pullImage === 'はい') {
                this.outputChannel.appendLine('Asciidoctor Dockerイメージをダウンロード中...');
                vscode.window.showInformationMessage('Asciidoctor Dockerイメージをダウンロード中です。しばらくお待ちください。');
                
                const { stdout: pullOutput } = await execAsync('docker pull asciidoctor/docker-asciidoctor');
                this.outputChannel.appendLine('ダウンロード完了:');
                this.outputChannel.appendLine(pullOutput);
                
                vscode.window.showInformationMessage('Asciidoctor Dockerイメージのダウンロードが完了しました。');
                return true;
            }

            return false;
        } catch (error) {
            this.outputChannel.appendLine(`イメージ確認エラー: ${error}`);
            vscode.window.showErrorMessage('Asciidoctor Dockerイメージの確認中にエラーが発生しました。');
            return false;
        }
    }

    async buildHtml(): Promise<void> {
        try {
            this.outputChannel.show();
            this.outputChannel.appendLine('HTML ビルドを開始します...');

            // Dockerの可用性をチェック
            if (!await this.checkDockerAvailability()) {
                return;
            }

            // Asciidoctorイメージの確認
            if (!await this.ensureAsciidoctorImage()) {
                return;
            }

            // Asciidocファイルの選択
            const filePath = await this.selectAsciidocFile();
            if (!filePath) {
                return;
            }

            const workspaceRoot = this.getWorkspaceRoot();
            const config = vscode.workspace.getConfiguration('asciidocSuite');
            
            const outputDir = config.get<string>('build.outputDirectory', './output');
            const stylesheet = config.get<string>('build.stylesheet', 'style.css');
            const enableDiagrams = config.get<boolean>('build.enableDiagrams', true);

            // 出力ディレクトリの準備
            const fullOutputDir = path.resolve(workspaceRoot, outputDir);
            await fs.ensureDir(fullOutputDir);

            // Dockerコンテナを使用してAsciidoctorを実行
            const outputFile = path.join(fullOutputDir, 'index.html');
            const relativeFilePath = path.relative(workspaceRoot, filePath);
            const relativeOutputDir = path.relative(workspaceRoot, fullOutputDir);
            const relativeOutputFile = path.join(relativeOutputDir, 'index.html');
            
            this.outputChannel.appendLine(`ワークスペースルート: ${workspaceRoot}`);
            this.outputChannel.appendLine(`入力ファイル: ${relativeFilePath}`);
            this.outputChannel.appendLine(`出力ディレクトリ: ${relativeOutputDir}`);
            this.outputChannel.appendLine(`出力ファイル: ${relativeOutputFile}`);
            
            let command = `docker run --rm `;
            command += `-v "${workspaceRoot}:/workspace" `;
            command += `-w /workspace `;
            command += `asciidoctor/docker-asciidoctor asciidoctor`;
            
            if (stylesheet) {
                const stylesheetPathMode = config.get<string>('build.stylesheetPath', 'auto');
                let stylesheetPath;
                
                // 入力ファイルのディレクトリ（プロジェクトルート）
                const inputFileDir = path.dirname(relativeFilePath);
                
                // スタイルシートパスの決定ロジック
                if (stylesheetPathMode === 'same-directory') {
                    // 入力ファイルと同じディレクトリ
                    stylesheetPath = path.join(inputFileDir, stylesheet);
                } else if (stylesheetPathMode === 'project-root') {
                    // プロジェクトルート直下
                    stylesheetPath = path.join(inputFileDir, stylesheet);
                } else {
                    // auto: 複数の場所を検索
                    const candidatePaths = [
                        // 1. 入力ファイルと同じディレクトリ（プロジェクトルート）
                        path.join(inputFileDir, stylesheet),
                        // 2. ワークスペースルート直下
                        stylesheet,
                        // 3. 相対的な親ディレクトリ
                        path.join('..', stylesheet)
                    ];
                    
                    stylesheetPath = path.join(inputFileDir, stylesheet); // デフォルト: プロジェクトルート
                    
                    this.outputChannel.appendLine(`スタイルシート検索を開始...`);
                    for (const candidatePath of candidatePaths) {
                        const fullPath = path.resolve(workspaceRoot, candidatePath);
                        this.outputChannel.appendLine(`  チェック中: ${candidatePath} -> ${fullPath}`);
                        if (await fs.pathExists(fullPath)) {
                            stylesheetPath = candidatePath;
                            this.outputChannel.appendLine(`  ✓ スタイルシートを発見: ${fullPath}`);
                            break;
                        } else {
                            this.outputChannel.appendLine(`  ✗ 見つかりません`);
                        }
                    }
                }
                
                this.outputChannel.appendLine(`最終スタイルシートパス: ${stylesheetPath}`);
                
                // スタイルシートファイルの存在確認
                const fullStylesheetPath = path.resolve(workspaceRoot, stylesheetPath);
                if (await fs.pathExists(fullStylesheetPath)) {
                    // Dockerコンテナ内では /workspace プレフィックスが必要
                    const containerStylesheetPath = `/workspace/${stylesheetPath}`;
                    command += ` -a stylesheet=${containerStylesheetPath}`;
                    this.outputChannel.appendLine(`スタイルシートファイルが見つかりました: ${fullStylesheetPath}`);
                    this.outputChannel.appendLine(`コンテナ内パス: ${containerStylesheetPath}`);
                } else {
                    this.outputChannel.appendLine(`警告: スタイルシートファイルが見つかりません: ${fullStylesheetPath}`);
                    this.outputChannel.appendLine('デフォルトスタイルでビルドを続行します。');
                }
            }
            
            if (enableDiagrams) {
                command += ` -r asciidoctor-diagram`;
            }

            command += ` -o "${relativeOutputFile}" "${relativeFilePath}"`;

            this.outputChannel.appendLine(`実行コマンド: ${command}`);

            // 出力ディレクトリを確実に作成するため、Dockerコンテナ内でもmkdirを実行
            const mkdirCommand = `docker run --rm -v "${workspaceRoot}:/workspace" -w /workspace asciidoctor/docker-asciidoctor mkdir -p "${relativeOutputDir}"`;
            this.outputChannel.appendLine(`ディレクトリ作成コマンド: ${mkdirCommand}`);
            
            try {
                await execAsync(mkdirCommand, { cwd: workspaceRoot });
                this.outputChannel.appendLine('出力ディレクトリを作成しました。');
            } catch (error) {
                this.outputChannel.appendLine(`ディレクトリ作成警告: ${error}`);
                // エラーでも続行（既に存在する場合など）
            }

            // ビルド実行
            const { stdout, stderr } = await execAsync(command, { 
                cwd: workspaceRoot,
                maxBuffer: 1024 * 1024 * 10 // 10MB
            });

            if (stdout) {
                this.outputChannel.appendLine('STDOUT:');
                this.outputChannel.appendLine(stdout);
            }

            if (stderr) {
                this.outputChannel.appendLine('STDERR:');
                this.outputChannel.appendLine(stderr);
            }

            this.outputChannel.appendLine('HTML ビルドが完了しました。');
            vscode.window.showInformationMessage(`HTML ビルドが完了しました: ${outputFile}`);

            // 生成されたHTMLファイルを開くかどうか確認
            const openFile = await vscode.window.showInformationMessage(
                'ビルドが完了しました。HTMLファイルを開きますか？',
                '開く',
                'キャンセル'
            );

            if (openFile === '開く') {
                await vscode.env.openExternal(vscode.Uri.file(outputFile));
            }

        } catch (error) {
            this.outputChannel.appendLine(`エラー: ${error}`);
            vscode.window.showErrorMessage(`HTML ビルド中にエラーが発生しました: ${error}`);
        }
    }

    async exportArchive(): Promise<void> {
        try {
            this.outputChannel.show();
            this.outputChannel.appendLine('アーカイブエクスポートを開始します...');

            const workspaceRoot = this.getWorkspaceRoot();
            const config = vscode.workspace.getConfiguration('asciidocSuite');
            const outputDir = config.get<string>('build.outputDirectory', './output');
            
            const fullOutputDir = path.resolve(workspaceRoot, outputDir);
            
            // 出力ディレクトリの存在確認
            if (!await fs.pathExists(fullOutputDir)) {
                vscode.window.showErrorMessage('出力ディレクトリが見つかりません。先にビルドを実行してください。');
                return;
            }

            // アーカイブディレクトリの準備
            const archiveDir = path.join(workspaceRoot, 'archive');
            await fs.ensureDir(archiveDir);

            // タイムスタンプ付きファイル名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const archiveFile = path.join(archiveDir, `output-${timestamp}.zip`);

            // ZIPコマンドの実行
            const command = `zip -r "${archiveFile}" "${outputDir}"`;
            this.outputChannel.appendLine(`実行コマンド: ${command}`);

            const { stdout, stderr } = await execAsync(command, { 
                cwd: workspaceRoot,
                maxBuffer: 1024 * 1024 * 10 // 10MB
            });

            if (stdout) {
                this.outputChannel.appendLine('STDOUT:');
                this.outputChannel.appendLine(stdout);
            }

            if (stderr) {
                this.outputChannel.appendLine('STDERR:');
                this.outputChannel.appendLine(stderr);
            }

            this.outputChannel.appendLine('アーカイブエクスポートが完了しました。');
            vscode.window.showInformationMessage(`アーカイブが作成されました: ${archiveFile}`);

        } catch (error) {
            this.outputChannel.appendLine(`エラー: ${error}`);
            vscode.window.showErrorMessage(`アーカイブエクスポート中にエラーが発生しました: ${error}`);
        }
    }

    // Asciidocファイルを自動検出または選択する
    private async selectAsciidocFile(): Promise<string | undefined> {
        const activeEditor = vscode.window.activeTextEditor;
        
        // アクティブなエディタでAsciidocファイルが開かれている場合はそれを使用
        if (activeEditor && activeEditor.document.fileName.endsWith('.adoc')) {
            return activeEditor.document.fileName;
        }

        // ワークスペース内のAsciidocファイルを検索
        const adocFiles = await vscode.workspace.findFiles('**/*.adoc', '**/node_modules/**', 50);
        
        if (adocFiles.length === 0) {
            vscode.window.showErrorMessage('ワークスペース内にAsciidocファイルが見つかりません。');
            return undefined;
        }

        if (adocFiles.length === 1) {
            // 1つだけの場合は自動選択
            return adocFiles[0].fsPath;
        }

        // index.adocを優先的に検索
        const indexFile = adocFiles.find(file => 
            path.basename(file.fsPath).toLowerCase() === 'index.adoc'
        );
        
        if (indexFile) {
            const useIndex = await vscode.window.showInformationMessage(
                'index.adocが見つかりました。このファイルをビルドしますか？',
                'はい',
                'ファイルを選択'
            );
            
            if (useIndex === 'はい') {
                return indexFile.fsPath;
            }
        }

        // 複数のファイルから選択
        const fileItems = adocFiles.map(file => ({
            label: path.basename(file.fsPath),
            description: vscode.workspace.asRelativePath(file),
            detail: file.fsPath
        }));

        const selectedFile = await vscode.window.showQuickPick(fileItems, {
            placeHolder: 'ビルドするAsciidocファイルを選択してください'
        });

        return selectedFile?.detail;
    }

    private getWorkspaceRoot(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('ワークスペースが開かれていません。');
        }
        return workspaceFolders[0].uri.fsPath;
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
