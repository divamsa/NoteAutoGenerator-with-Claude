import React, { useState, useCallback, useRef } from 'react';

export default function NoteArticleGenerator() {
  const [mdFiles, setMdFiles] = useState([]);
  const [docContent, setDocContent] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [generatedArticle, setGeneratedArticle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [articleTitle, setArticleTitle] = useState('');
  const [articleTone, setArticleTone] = useState('casual');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [obsidianPath, setObsidianPath] = useState('');
  const [isLoadingObsidian, setIsLoadingObsidian] = useState(false);
  
  // GitHub関連のstate
  const [fileName, setFileName] = useState('NoteArticleGenerator.jsx');
  const [uploadCode, setUploadCode] = useState('');
  
  const obsidianInputRef = useRef(null);
  const docInputRef = useRef(null);

  // ==========================================
  // Obsidian Vault読み込み
  // ==========================================
  const handleObsidianFolderSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsLoadingObsidian(true);
    setError('');
    setSuccess('');

    try {
      const firstPath = files[0].webkitRelativePath;
      const folderName = firstPath.split('/')[0];
      setObsidianPath(folderName);

      const mdFilesOnly = files.filter(f => 
        f.name.endsWith('.md') && 
        !f.webkitRelativePath.includes('/.')
      );

      const filesToProcess = mdFilesOnly.slice(0, 50);
      const loadedFiles = [];

      for (const file of filesToProcess) {
        const content = await file.text();
        loadedFiles.push({
          name: file.webkitRelativePath,
          content,
          id: Date.now() + Math.random(),
        });
      }

      setMdFiles(loadedFiles);

      if (loadedFiles.length === 0) {
        setError('MDファイルが見つかりませんでした');
      } else {
        setSuccess(`${loadedFiles.length}件のMDファイルを読み込みました`);
      }
    } catch (err) {
      setError('フォルダの読み込みに失敗: ' + err.message);
    } finally {
      setIsLoadingObsidian(false);
    }
  };

  // ==========================================
  // 手動アップロード
  // ==========================================
  const handleMdUpload = useCallback((e) => {
    const files = Array.from(e.target.files);
    const mdFilesOnly = files.filter(f => f.name.endsWith('.md'));
    
    if (mdFiles.length + mdFilesOnly.length > 50) {
      setError('mdファイルは最大50個までです');
      return;
    }
    
    setError('');
    
    mdFilesOnly.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setMdFiles(prev => [...prev, {
          name: file.name,
          content: event.target.result,
          id: Date.now() + Math.random()
        }]);
      };
      reader.readAsText(file);
    });
    
    setSuccess(`${mdFilesOnly.length}件追加しました`);
  }, [mdFiles.length]);

  const handleDocUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setError('');
    setDocFileName(file.name);
    
    if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const text = await file.text();
      setDocContent(text);
      setSuccess('コンテンツファイルを読み込みました');
    } else {
      setError('対応形式: .txt, .md');
    }
  }, []);

  // コードファイルアップロード（GitHub用）
  const handleCodeUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const text = await file.text();
    setUploadCode(text);
    setFileName(file.name);
    setSuccess(`${file.name} を読み込みました`);
  }, []);

  const removeMdFile = (id) => {
    setMdFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAllMdFiles = () => {
    setMdFiles([]);
    setObsidianPath('');
    if (obsidianInputRef.current) obsidianInputRef.current.value = '';
  };

  const clearDocContent = () => {
    setDocContent('');
    setDocFileName('');
    if (docInputRef.current) docInputRef.current.value = '';
  };

  // ==========================================
  // 記事生成 (Claude API)
  // ==========================================
  const generateArticle = async () => {
    if (!docContent && mdFiles.length === 0) {
      setError('ファイルをアップロードしてください');
      return;
    }

    setIsGenerating(true);
    setError('');
    setSuccess('');
    setActiveTab('result');

    const mdContext = mdFiles.map(f => `### ${f.name}\n${f.content}`).join('\n\n---\n\n');
    
    const toneGuide = {
      casual: '友人に話すようなカジュアルで親しみやすい文体。',
      professional: '丁寧だが堅すぎない、プロフェッショナルな文体。',
      storytelling: 'ストーリーテリング調。読者を物語に引き込む語り口。',
      essay: 'エッセイ調。個人の考えや感情を織り交ぜた文体。'
    };

    const prompt = `あなたはnoteで人気のライターです。以下の参考資料と詳細内容を基に、noteの記事を作成してください。

## 重要な指示
- 人間が書いたような自然な文章
- AIっぽい表現を避ける
- 読者に語りかけるような文体
- noteの記事らしく、冒頭で読者の興味を引く

## 文体: ${toneGuide[articleTone]}

${articleTitle ? `## タイトル案: ${articleTitle}` : ''}

## 参考資料
${mdContext || '（なし）'}

## 詳細内容
${docContent || '（なし）'}

3000〜5000文字程度のnote記事を作成してください。`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.error.message);
      
      const articleText = data.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
      
      setGeneratedArticle(articleText);
      setSuccess('記事を生成しました！');
    } catch (err) {
      setError('記事生成に失敗: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedArticle);
      setSuccess('クリップボードにコピーしました');
    } catch {
      setError('コピーに失敗しました');
    }
  };

  // ==========================================
  // UI
  // ==========================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-stone-800">Note Article Generator</h1>
                <p className="text-xs text-stone-500">人間らしい記事をAIで生成</p>
              </div>
            </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-white border-b border-stone-200 sticky top-16 z-10">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex overflow-x-auto">
            {[
              { id: 'upload', label: '📁 素材', count: mdFiles.length + (docFileName ? 1 : 0) },
              { id: 'settings', label: '⚙️ 設定' },
              { id: 'result', label: '📝 結果' },
              { id: 'github', label: '🐙 GitHub' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-stone-500 hover:text-stone-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm flex items-center gap-2">
            <span>✓</span> {success}
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            {/* Obsidian Section */}
            <section className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-stone-100 bg-gradient-to-r from-purple-50 to-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
                      <span className="text-white text-sm">📚</span>
                    </div>
                    <div>
                      <h2 className="font-semibold text-stone-800">参考資料（Obsidian Vault）</h2>
                      <p className="text-xs text-stone-500">文体・構成の参考にするMDファイル</p>
                    </div>
                  </div>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                    {mdFiles.length} / 50
                  </span>
                </div>
              </div>
              
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <label className="flex-1">
                    <div className={`py-3 px-4 bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium rounded-xl border-2 border-dashed border-purple-200 hover:border-purple-400 transition-all cursor-pointer text-center text-sm ${isLoadingObsidian ? 'opacity-50' : ''}`}>
                      {isLoadingObsidian ? '読み込み中...' : '📂 Vaultフォルダを選択'}
                    </div>
                    <input
                      ref={obsidianInputRef}
                      type="file"
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleObsidianFolderSelect}
                      className="hidden"
                      disabled={isLoadingObsidian}
                    />
                  </label>
                  
                  <label className="flex-1">
                    <div className="py-3 px-4 bg-stone-50 hover:bg-stone-100 text-stone-600 font-medium rounded-xl border-2 border-dashed border-stone-200 hover:border-stone-400 transition-all cursor-pointer text-center text-sm">
                      📄 個別ファイル追加
                    </div>
                    <input
                      type="file"
                      multiple
                      accept=".md"
                      onChange={handleMdUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {obsidianPath && (
                  <div className="flex items-center justify-between text-sm bg-purple-50 rounded-lg px-3 py-2">
                    <span className="text-purple-700">📁 {obsidianPath}</span>
                    <button onClick={clearAllMdFiles} className="text-purple-500 hover:text-red-500">クリア</button>
                  </div>
                )}

                {mdFiles.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1 bg-stone-50 rounded-lg p-2">
                    {mdFiles.map(file => (
                      <div key={file.id} className="flex items-center justify-between px-2 py-1 hover:bg-white rounded text-xs group">
                        <span className="text-stone-600 truncate flex-1 mr-2">{file.name}</span>
                        <button
                          onClick={() => removeMdFile(file.id)}
                          className="text-stone-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Document Section */}
            <section className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-stone-100 bg-gradient-to-r from-blue-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                    <span className="text-white text-sm">📝</span>
                  </div>
                  <div>
                    <h2 className="font-semibold text-stone-800">詳細コンテンツ</h2>
                    <p className="text-xs text-stone-500">記事のメインとなる内容</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4">
                <label className="block">
                  <div className="py-6 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-xl border-2 border-dashed border-blue-200 hover:border-blue-400 transition-all cursor-pointer text-center">
                    {docFileName ? (
                      <div className="flex items-center justify-center gap-2">
                        <span>📄</span>
                        <span>{docFileName}</span>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm">クリックしてファイルを選択</p>
                        <p className="text-xs text-blue-500 mt-1">.txt または .md</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".txt,.md"
                    onChange={handleDocUpload}
                    className="hidden"
                  />
                </label>

                {docContent && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-stone-500">プレビュー</span>
                      <button onClick={clearDocContent} className="text-xs text-stone-400 hover:text-red-500">クリア</button>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-lg max-h-32 overflow-y-auto">
                      <p className="text-xs text-stone-600 whitespace-pre-wrap">{docContent.slice(0, 500)}{docContent.length > 500 ? '...' : ''}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <button
              onClick={() => setActiveTab('settings')}
              disabled={!docContent && mdFiles.length === 0}
              className="w-full py-3 bg-stone-800 hover:bg-stone-900 text-white font-medium rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              設定へ進む →
            </button>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
              <h2 className="font-semibold text-stone-800 mb-4">📝 記事設定</h2>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">タイトル案（任意）</label>
                  <input
                    type="text"
                    value={articleTitle}
                    onChange={(e) => setArticleTitle(e.target.value)}
                    placeholder="記事のタイトルを入力..."
                    className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-3">文体スタイル</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'casual', label: 'カジュアル', emoji: '💬' },
                      { id: 'professional', label: 'プロ', emoji: '💼' },
                      { id: 'storytelling', label: 'ストーリー', emoji: '📖' },
                      { id: 'essay', label: 'エッセイ', emoji: '✍️' }
                    ].map(tone => (
                      <button
                        key={tone.id}
                        onClick={() => setArticleTone(tone.id)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          articleTone === tone.id
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        <span>{tone.emoji} {tone.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <button
              onClick={generateArticle}
              disabled={isGenerating || (!docContent && mdFiles.length === 0)}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl disabled:opacity-50 transition-all shadow-lg"
            >
              {isGenerating ? '生成中...' : '✨ 記事を生成する'}
            </button>
          </div>
        )}

        {/* Result Tab */}
        {activeTab === 'result' && (
          <div className="space-y-4">
            {isGenerating ? (
              <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center animate-pulse">
                  <span className="text-2xl">✍️</span>
                </div>
                <p className="text-stone-600 font-medium">記事を生成しています...</p>
              </div>
            ) : generatedArticle ? (
              <section className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-stone-100">
                  <h2 className="font-semibold text-stone-800">📝 生成された記事</h2>
                  <button
                    onClick={copyToClipboard}
                    className="px-4 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg"
                  >
                    📋 コピー
                  </button>
                </div>
                <div className="p-5 max-h-[60vh] overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm text-stone-700 leading-relaxed">
                    {generatedArticle}
                  </pre>
                </div>
              </section>
            ) : (
              <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
                <p className="text-stone-500">まだ記事が生成されていません</p>
              </div>
            )}
          </div>
        )}

        {/* GitHub Tab */}
        {activeTab === 'github' && (
          <div className="space-y-6">
            {/* ダウンロードセクション */}
            <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-stone-900 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-stone-800">GitHubにアップロード</h2>
                <p className="text-sm text-stone-500 mt-1">コードをダウンロードしてGitHubへ</p>
              </div>

              <div className="space-y-4">
                {/* コードファイル選択 */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">アップロードするコード</label>
                  <label className="block">
                    <div className="py-4 px-4 bg-stone-50 hover:bg-stone-100 text-stone-600 font-medium rounded-xl border-2 border-dashed border-stone-300 hover:border-stone-400 transition-all cursor-pointer text-center text-sm">
                      {uploadCode ? `📄 ${fileName} (${uploadCode.length.toLocaleString()}文字)` : '📁 コードファイルを選択'}
                    </div>
                    <input
                      type="file"
                      accept=".jsx,.js,.ts,.tsx,.py,.html,.css,.json,.md,.txt"
                      onChange={handleCodeUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* ファイル名 */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">ファイル名</label>
                  <input
                    type="text"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  />
                </div>

                {/* ダウンロードボタン */}
                <button
                  onClick={() => {
                    if (!uploadCode) {
                      setError('コードファイルを選択してください');
                      return;
                    }
                    const blob = new Blob([uploadCode], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    setSuccess(`${fileName} をダウンロードしました`);
                  }}
                  disabled={!uploadCode}
                  className="w-full py-4 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl disabled:opacity-50 transition-all"
                >
                  💾 ダウンロード
                </button>

                {/* GitHub直接リンク */}
                <div className="flex gap-2">
                  <a
                    href="https://github.com/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors text-center text-sm"
                  >
                    ➕ 新規リポジトリ作成
                  </a>
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 bg-stone-200 hover:bg-stone-300 text-stone-700 font-medium rounded-xl transition-colors text-center text-sm"
                  >
                    🐙 GitHubを開く
                  </a>
                </div>
              </div>
            </section>

            {/* 手順説明 */}
            <section className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-5 border border-blue-100">
              <h3 className="font-semibold text-stone-800 mb-3">📝 GitHubへのアップロード手順</h3>
              <ol className="space-y-3 text-sm text-stone-600">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  <span>上の「コードファイルを選択」からアップロードしたいファイルを選択</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  <span>「ダウンロード」ボタンでファイルをダウンロード</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  <span>「新規リポジトリ作成」または既存のリポジトリを開く</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                  <span>「Add file」→「Upload files」でダウンロードしたファイルをドラッグ&ドロップ</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
                  <span>「Commit changes」をクリックして完了！</span>
                </li>
              </ol>
            </section>

            {/* 注意事項 */}
            <section className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800 border border-amber-200">
              <h3 className="font-medium mb-2">⚠️ 注意</h3>
              <p className="text-xs">
                ブラウザのセキュリティ制限により、このアプリから直接GitHubにアップロードすることはできません。
                上記の手順でダウンロード→手動アップロードをお願いします。
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
