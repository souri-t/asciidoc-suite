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
            return false;
        }
    }

    // ネイティブAsciidoctorの可用性をチェック
    private async checkNativeAsciidoctorAvailability(): Promise<boolean> {
        try {
            const config = vscode.workspace.getConfiguration('asciidocSuite');
            const nativeAsciidoctorPath = config.get<string>('build.nativeAsciidoctorPath', 'asciidoctor-pdf');
            const { stdout } = await execAsync(`${nativeAsciidoctorPath} --version`);
            this.outputChannel.appendLine(`ネイティブAsciidoctor PDF検出: ${stdout.trim()}`);
            return true;
        } catch (error) {
            this.outputChannel.appendLine(`ネイティブAsciidoctor PDFが見つかりません: ${error}`);
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

    // ネイティブAsciidoctor-PDFを使用してビルド
    private async buildPdfNative(filePath: string, workspaceRoot: string, config: vscode.WorkspaceConfiguration): Promise<void> {
        const outputDir = config.get<string>('build.outputDirectory', './output');
        const pdfTheme = config.get<string>('build.pdfTheme', './theme/document-theme.yml');
        const enableDiagrams = config.get<boolean>('build.enableDiagrams', true);
        const nativeAsciidoctorPath = config.get<string>('build.nativeAsciidoctorPath', 'asciidoctor-pdf');

        // 出力ディレクトリの準備
        const fullOutputDir = path.resolve(workspaceRoot, outputDir);
        await fs.ensureDir(fullOutputDir);

        const fileName = path.basename(filePath, '.adoc');
        const outputFile = path.join(fullOutputDir, `${fileName}.pdf`);
        const relativeFilePath = path.relative(workspaceRoot, filePath);
        const relativeOutputFile = path.relative(workspaceRoot, outputFile);
        
        this.outputChannel.appendLine(`ワークスペースルート: ${workspaceRoot}`);
        this.outputChannel.appendLine(`入力ファイル: ${relativeFilePath}`);
        this.outputChannel.appendLine(`出力ファイル: ${relativeOutputFile}`);
        
        let command = nativeAsciidoctorPath;
        
        // CJKスクリプト有効化
        command += ` -a scripts=cjk`;
        
        // 図表機能の有効化
        if (enableDiagrams) {
            command += ` -r asciidoctor-diagram`;
        }
        
        // PDFテーマの指定
        if (pdfTheme) {
            const inputFileDir = path.dirname(relativeFilePath);
            const themePathFromInputDir = path.join(inputFileDir, pdfTheme);
            
            this.outputChannel.appendLine(`PDFテーマ検索を開始...`);
            const fullThemePath = path.resolve(workspaceRoot, themePathFromInputDir);
            this.outputChannel.appendLine(`  チェック中: ${themePathFromInputDir} -> ${fullThemePath}`);
            
            if (await fs.pathExists(fullThemePath)) {
                command += ` -a pdf-theme=${themePathFromInputDir}`;
                this.outputChannel.appendLine(`  ✓ PDFテーマを発見: ${fullThemePath}`);
            } else {
                this.outputChannel.appendLine(`  ✗ PDFテーマが見つかりません: ${fullThemePath}`);
                this.outputChannel.appendLine('デフォルトテーマでビルドを続行します。');
            }
        }

        command += ` -o "${relativeOutputFile}" "${relativeFilePath}"`;

        this.outputChannel.appendLine(`実行コマンド: ${command}`);

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

        this.outputChannel.appendLine('PDF ビルドが完了しました（ネイティブ）。');
        vscode.window.showInformationMessage(`PDF ビルドが完了しました: ${outputFile}`);

        // 生成されたPDFファイルを開くかどうか確認
        const openFile = await vscode.window.showInformationMessage(
            'ビルドが完了しました。PDFファイルを開きますか？',
            '開く',
            'キャンセル'
        );

        if (openFile === '開く') {
            await vscode.env.openExternal(vscode.Uri.file(outputFile));
        }
    }

    async buildPdf(): Promise<void> {
        try {
            this.outputChannel.show();
            this.outputChannel.appendLine('PDF ビルドを開始します...');

            // Asciidocファイルの選択
            const filePath = await this.selectAsciidocFile();
            if (!filePath) {
                return;
            }

            const workspaceRoot = this.getWorkspaceRoot();
            const config = vscode.workspace.getConfiguration('asciidocSuite');
            const useDocker = config.get<boolean>('build.useDocker', true);

            // ビルド方法の決定
            let useDockerBuild = false;
            let useNativeBuild = false;

            if (useDocker) {
                // Docker優先設定の場合
                const dockerAvailable = await this.checkDockerAvailability();
                if (dockerAvailable && await this.ensureAsciidoctorImage()) {
                    useDockerBuild = true;
                    this.outputChannel.appendLine('Dockerを使用してビルドします。');
                } else {
                    // Dockerが利用できない場合はネイティブにフォールバック
                    const nativeAvailable = await this.checkNativeAsciidoctorAvailability();
                    if (nativeAvailable) {
                        useNativeBuild = true;
                        this.outputChannel.appendLine('Dockerが利用できないため、ネイティブAsciidoctorを使用します。');
                    }
                }
            } else {
                // ネイティブ優先設定の場合
                const nativeAvailable = await this.checkNativeAsciidoctorAvailability();
                if (nativeAvailable) {
                    useNativeBuild = true;
                    this.outputChannel.appendLine('ネイティブAsciidoctorを使用してビルドします。');
                } else {
                    // ネイティブが利用できない場合はDockerにフォールバック
                    const dockerAvailable = await this.checkDockerAvailability();
                    if (dockerAvailable && await this.ensureAsciidoctorImage()) {
                        useDockerBuild = true;
                        this.outputChannel.appendLine('ネイティブAsciidoctorが利用できないため、Dockerを使用します。');
                    }
                }
            }

            if (!useDockerBuild && !useNativeBuild) {
                vscode.window.showErrorMessage(
                    'DockerもネイティブAsciidoctorも利用できません。どちらかをインストールしてください。',
                    'Dockerについて',
                    'Asciidoctorについて'
                ).then(selection => {
                    if (selection === 'Dockerについて') {
                        vscode.env.openExternal(vscode.Uri.parse('https://docs.docker.com/get-docker/'));
                    } else if (selection === 'Asciidoctorについて') {
                        vscode.env.openExternal(vscode.Uri.parse('https://docs.asciidoctor.org/asciidoctor/latest/install/'));
                    }
                });
                return;
            }

            // 選択されたビルド方法で実行
            if (useNativeBuild) {
                await this.buildPdfNative(filePath, workspaceRoot, config);
                return;
            }
            
            // useDockerBuildの場合のみ以下のDockerビルドを実行
            const outputDir = config.get<string>('build.outputDirectory', './output');
            const pdfTheme = config.get<string>('build.pdfTheme', './theme/document-theme.yml');
            const enableDiagrams = config.get<boolean>('build.enableDiagrams', true);

            // 出力ディレクトリの準備
            const fullOutputDir = path.resolve(workspaceRoot, outputDir);
            await fs.ensureDir(fullOutputDir);

            // Dockerコンテナを使用してAsciidoctor-PDFを実行
            const fileName = path.basename(filePath, '.adoc');
            const outputFile = path.join(fullOutputDir, `${fileName}.pdf`);
            const relativeFilePath = path.relative(workspaceRoot, filePath);
            const relativeOutputDir = path.relative(workspaceRoot, fullOutputDir);
            const relativeOutputFile = path.join(relativeOutputDir, `${fileName}.pdf`);
            
            this.outputChannel.appendLine(`ワークスペースルート: ${workspaceRoot}`);
            this.outputChannel.appendLine(`入力ファイル: ${relativeFilePath}`);
            this.outputChannel.appendLine(`出力ディレクトリ: ${relativeOutputDir}`);
            this.outputChannel.appendLine(`出力ファイル: ${relativeOutputFile}`);
            
            let command = `docker run --rm `;
            command += `-v "${workspaceRoot}:/workspace" `;
            command += `-w /workspace `;
            command += `asciidoctor/docker-asciidoctor asciidoctor-pdf`;
            
            // CJKスクリプト有効化
            command += ` -a scripts=cjk`;
            
            // 図表機能の有効化
            if (enableDiagrams) {
                command += ` -r asciidoctor-diagram`;
            }
            
            // PDFテーマの指定
            if (pdfTheme) {
                const inputFileDir = path.dirname(relativeFilePath);
                const themePathFromInputDir = path.join(inputFileDir, pdfTheme);
                
                this.outputChannel.appendLine(`PDFテーマ検索を開始...`);
                const fullThemePath = path.resolve(workspaceRoot, themePathFromInputDir);
                this.outputChannel.appendLine(`  チェック中: ${themePathFromInputDir} -> ${fullThemePath}`);
                
                if (await fs.pathExists(fullThemePath)) {
                    command += ` -a pdf-theme=${themePathFromInputDir}`;
                    this.outputChannel.appendLine(`  ✓ PDFテーマを発見: ${fullThemePath}`);
                } else {
                    this.outputChannel.appendLine(`  ✗ PDFテーマが見つかりません: ${fullThemePath}`);
                    this.outputChannel.appendLine('デフォルトテーマでビルドを続行します。');
                }
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

            this.outputChannel.appendLine('PDF ビルドが完了しました（Docker）。');
            vscode.window.showInformationMessage(`PDF ビルドが完了しました: ${outputFile}`);

            // 生成されたPDFファイルを開くかどうか確認
            const openFile = await vscode.window.showInformationMessage(
                'ビルドが完了しました。PDFファイルを開きますか？',
                '開く',
                'キャンセル'
            );

            if (openFile === '開く') {
                await vscode.env.openExternal(vscode.Uri.file(outputFile));
            }

        } catch (error) {
            this.outputChannel.appendLine(`エラー: ${error}`);
            vscode.window.showErrorMessage(`PDF ビルド中にエラーが発生しました: ${error}`);
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

        // sample.adocを優先的に検索
        const sampleFile = adocFiles.find(file => 
            path.basename(file.fsPath).toLowerCase() === 'sample.adoc'
        );
        
        if (sampleFile) {
            const useSample = await vscode.window.showInformationMessage(
                'sample.adocが見つかりました。このファイルをビルドしますか？',
                'はい',
                'ファイルを選択'
            );
            
            if (useSample === 'はい') {
                return sampleFile.fsPath;
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
