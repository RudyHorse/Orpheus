import { useState, useEffect, useRef, useCallback } from 'react'

const API_BASE = ''
const SUPPORTED_FORMATS = '.mp3,.wav,.flac,.m4a,.ogg,.aiff,.aif,.caf,.mp4,audio/*'

function App() {
  const [inputPath, setInputPath] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [transcribedText, setTranscribedText] = useState('')
  const [audioInfo, setAudioInfo] = useState(null)
  const [isConverting, setIsConverting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingLlm, setIsSavingLlm] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [parallelMode, setParallelMode] = useState(false)
  const [cpuThreads, setCpuThreads] = useState(1)
  const [selectedModel, setSelectedModel] = useState('GigaAM-v3')
  const [availableModels, setAvailableModels] = useState(['GigaAM-v3'])
  const [isSettingsLoading, setIsSettingsLoading] = useState(false)
  const [runtime, setRuntime] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isStopping, setIsStopping] = useState(false)
  const [currentChunk, setCurrentChunk] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [transcriptionId, setTranscriptionId] = useState(null)
  const [batchId, setBatchId] = useState(null)
  const [batchProgress, setBatchProgress] = useState(null)
  const [splitMarkers, setSplitMarkers] = useState([])
  const [chunksToSend, setChunksToSend] = useState([])
  const [showManualSplit, setShowManualSplit] = useState(false)
  const [llmModel, setLlmModel] = useState('')
  const [llmPrompt, setLlmPrompt] = useState('')
  const [llmResult, setLlmResult] = useState('')
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmError, setLlmError] = useState('')
  const [ollamaModels, setOllamaModels] = useState([])
  const [ollamaLoginMsg, setOllamaLoginMsg] = useState('')
  const [pullModelName, setPullModelName] = useState('')
  const [pullStatus, setPullStatus] = useState('')
  const [llmOutputPath, setLlmOutputPath] = useState('')
  const [batchFileResults, setBatchFileResults] = useState([])
  const [selectedBatchFile, setSelectedBatchFile] = useState(0)
  const [batchMode, setBatchMode] = useState(false)
  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const outputFileRef = useRef(null)
  const llmFileRef = useRef(null)

  const checkModelStatus = useCallback(async () => {
    try {
      const modelsRes = await fetch(`${API_BASE}/api/models`)
      const modelsData = await modelsRes.json()
      if (modelsData.models) {
        setAvailableModels(modelsData.models.map(m => m.id))
      }
      
      const settingsRes = await fetch(`${API_BASE}/api/settings`)
      const settingsData = await settingsRes.json()
      setCpuThreads(settingsData.cpu_threads || 1)
      setParallelMode((settingsData.cpu_threads || 1) > 1)
      
      const ollamaRes = await fetch(`${API_BASE}/api/llm/models`)
      const ollamaData = await ollamaRes.json()
      if (ollamaData.success) {
        setOllamaModels(ollamaData.models)
        if (ollamaData.models.length > 0) {
          setLlmModel(prev => prev || ollamaData.models[0])
        }
      }
    } catch {
    }
  }, [])

  useEffect(() => {
    checkModelStatus()
  }, [checkModelStatus])

  const resetState = useCallback(() => {
    setError('')
    setSuccess('')
    setTranscribedText('')
    setAudioInfo(null)
    setRuntime(null)
    setBatchId(null)
    setBatchProgress(null)
    setBatchFileResults([])
  }, [])

  const fetchAudioInfo = useCallback(async (file) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch(`${API_BASE}/api/audio-info`, {
        method: 'POST',
        body: formData,
      })
      
      const data = await response.json()
      if (data.success) {
        setAudioInfo(data.audio_info)
      } else {
        setError(data.error || 'Failed to get audio info')
      }
    } catch (err) {
      console.error('Failed to get audio info:', err)
    }
  }, [])

  const handleFileSelect = useCallback(async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }

    setSelectedFiles(files)
    setInputPath(files.map(f => f.name).join('; '))
    setAudioUrl(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setSplitMarkers([])
    setChunksToSend([])
    resetState()

    if (files.length === 1) {
      const url = URL.createObjectURL(files[0])
      setAudioUrl(url)
      await fetchAudioInfo(files[0])
    }
  }, [resetState, fetchAudioInfo, audioUrl])

  const handleInputPathChange = useCallback((e) => {
    setInputPath(e.target.value)
    setSelectedFiles([])
    setAudioInfo(null)
    setAudioUrl(null)
  }, [])

  const handleBrowseInput = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleBrowseOutput = useCallback(() => {
    outputFileRef.current?.click()
  }, [])

  const handleOutputPathChange = useCallback((e) => {
    setOutputPath(e.target.value)
  }, [])

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTimeFull = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`
  }

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const skip = useCallback((seconds) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, duration))
  }, [duration])

  const handleSeek = useCallback((e) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = parseFloat(e.target.value)
    setCurrentTime(parseFloat(e.target.value))
  }, [])

  const addSplitMarker = useCallback((time) => {
    if (!duration || time <= 0 || time >= duration) return
    const marker = Math.round(time * 10) / 10
    if (!splitMarkers.includes(marker)) {
      const newMarkers = [...splitMarkers, marker].sort((a, b) => a - b)
      setSplitMarkers(newMarkers)
      updateChunksFromMarkers(newMarkers)
    }
  }, [duration, splitMarkers])

  const removeSplitMarker = useCallback((time) => {
    const newMarkers = splitMarkers.filter(m => m !== time)
    setSplitMarkers(newMarkers)
    updateChunksFromMarkers(newMarkers)
  }, [splitMarkers])

const updateChunksFromMarkers = useCallback((markers) => {
    if (markers.length === 0) {
      setChunksToSend([{ start: 0, end: duration }])
      return
    }
    const newChunks = []
    let prev = 0
    for (const marker of markers) {
      newChunks.push({ start: prev, end: marker })
      prev = marker
    }
    newChunks.push({ start: prev, end: duration })
    setChunksToSend(newChunks)
  }, [duration])

  const toggleChunkSelection = useCallback((index) => {
    setChunksToSend(prev => prev.map((chunk, i) => 
      i === index ? { ...chunk, selected: !chunk.selected } : chunk
    ))
  }, [])

const removeChunk = useCallback((index) => {
    setChunksToSend(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleTimelineClick = useCallback((e) => {
    if (!duration || !audioRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = x / rect.width
    const time = Math.max(0, Math.min(percent * duration, duration))
    addSplitMarker(time)
  }, [duration, addSplitMarker])

  const handleParallelModeChange = useCallback(async (numCores) => {
    setIsSettingsLoading(true)
    try {
      await fetch(`${API_BASE}/api/settings?num_threads=${numCores}`, { method: 'POST' })
      setCpuThreads(numCores)
      setParallelMode(numCores > 1)
    } catch (err) {
      console.error('Failed to update settings', err)
    } finally {
      setIsSettingsLoading(false)
    }
  }, [])

  const handleConvert = useCallback(async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one audio file')
      return
    }

    setIsConverting(true)
    setError('')
    setSuccess('')
    setTranscribedText('')
    setCurrentChunk(0)
    setBatchId(null)
    setBatchProgress(null)

    if (selectedFiles.length === 1 && chunksToSend.length > 0) {
      try {
        const formData = new FormData()
        formData.append('file', selectedFiles[0])
        formData.append('chunks_json', JSON.stringify(chunksToSend.map(c => ({
          start_sec: c.start,
          end_sec: c.end
        }))))
        formData.append('model', selectedModel)

        const response = await fetch(`${API_BASE}/api/transcribe-chunks`, {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()
        setIsConverting(false)

        if (data.success && data.results && data.results.length > 0) {
          const allText = data.results.map(r => r.text).join(' ')
          setTranscribedText(allText)
          setTotalChunks(data.total_chunks)
          setCurrentChunk(data.processed_chunks)
          setRuntime(data.runtime_formatted || `${data.processed_chunks} chunks`)
        } else {
          setError(data.error || 'Transcription failed')
        }
      } catch (err) {
        setError('Failed to connect to server')
        setIsConverting(false)
      }
      return
    }

    if (selectedFiles.length === 1) {
      try {
        const formData = new FormData()
        formData.append('file', selectedFiles[0])
        formData.append('model', selectedModel)

        const startResponse = await fetch(`${API_BASE}/api/transcribe-start`, {
          method: 'POST',
          body: formData,
        })

        const startData = await startResponse.json()

        if (!startData.success) {
          setError(startData.error || 'Failed to start transcription')
          setIsConverting(false)
          return
        }

        const tid = startData.transcription_id
        setTranscriptionId(tid)

        const pollInterval = setInterval(async () => {
          try {
            const [progressRes, resultRes] = await Promise.all([
              fetch(`${API_BASE}/api/progress/${tid}`),
              fetch(`${API_BASE}/api/transcribe-result/${tid}`),
            ])

            const progressData = await progressRes.json()
            const resultData = await resultRes.json()

            if (progressData.total_chunks > 0) {
              setCurrentChunk(progressData.current_chunk)
              setTotalChunks(progressData.total_chunks)
            }

            if (!resultData.error || resultData.error !== 'Transcription in progress') {
              clearInterval(pollInterval)
              setIsConverting(false)
              setTranscriptionId(null)

              if (resultData.success) {
                setTranscribedText(resultData.text)
                setAudioInfo(resultData.audio_info)
                setRuntime(resultData.runtime_formatted)
              } else {
                setError(resultData.error || 'Transcription failed')
              }
            }
          } catch (err) {
            console.error('Polling error:', err)
          }
        }, 500)
      } catch {
        setError('Failed to connect to server. Make sure the backend is running.')
        setIsConverting(false)
      }
      return
    }

    if (selectedFiles.length > 1) {
      setBatchFileResults([])
      if (!batchMode) setTranscribedText('')
      try {
        const formData = new FormData()
        selectedFiles.forEach(f => formData.append('files', f))
        formData.append('model', selectedModel)
        formData.append('save_docs', batchMode ? 'true' : 'false')

        const startResponse = await fetch(`${API_BASE}/api/transcribe-batch`, {
          method: 'POST',
          body: formData,
        })

        const startData = await startResponse.json()

        if (!startData.success) {
          setError(startData.error || 'Failed to start batch transcription')
          setIsConverting(false)
          return
        }

        const bid = startData.batch_id
        setBatchId(bid)

        const pollInterval = setInterval(async () => {
          try {
            const [progressRes, resultRes] = await Promise.all([
              fetch(`${API_BASE}/api/batch-progress/${bid}`),
              fetch(`${API_BASE}/api/batch-result/${bid}`),
            ])

            const progressData = await progressRes.json()
            const resultData = await resultRes.json()

            if (progressData.status === 'processing' || progressData.status === 'starting') {
              setBatchProgress({
                filesTotal: progressData.files_total,
                filesDone: progressData.files_done,
                currentFile: progressData.current_file,
                currentChunk: progressData.current_chunk,
                totalChunks: progressData.total_chunks,
              })
              if (progressData.total_chunks > 0) {
                setCurrentChunk(progressData.current_chunk)
                setTotalChunks(progressData.total_chunks)
              }
            }

            if (resultData.success) {
              clearInterval(pollInterval)
              setIsConverting(false)
              setBatchId(null)
              setBatchProgress(null)
              if (batchMode) {
                setBatchFileResults(resultData.files || [])
              } else {
                setTranscribedText(resultData.combined_text || '')
                setBatchFileResults([])
              }
              setRuntime(resultData.total_runtime_formatted)
            } else if (resultData.error && resultData.error !== 'Batch not found' && !progressData.status) {
              clearInterval(pollInterval)
              setIsConverting(false)
              setBatchId(null)
              setError(resultData.error || 'Batch transcription failed')
            }
          } catch (err) {
            console.error('Batch polling error:', err)
          }
        }, 500)
      } catch {
        setError('Failed to connect to server. Make sure the backend is running.')
        setIsConverting(false)
      }
    }
  }, [selectedFiles, chunksToSend, batchMode])

  const handleLlmEnhance = useCallback(async () => {
    if (!llmPrompt.trim()) {
      setLlmError('Please enter a prompt')
      return
    }
    const text = batchFileResults.length > 0
      ? (batchFileResults[selectedBatchFile]?.text || '')
      : transcribedText
    if (!text) {
      setLlmError('No text available for the selected file')
      return
    }
    setLlmLoading(true)
    setLlmError('')
    setLlmResult('')
    try {
      const resp = await fetch(`${API_BASE}/api/llm/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          prompt: llmPrompt,
          model: llmModel || (ollamaModels[0] || 'minimax-m3:cloud'),
        }),
      })
      const data = await resp.json()
      if (data.success) {
        setLlmResult(data.result)
      } else {
        setLlmError(data.error || 'LLM enhancement failed')
      }
    } catch {
      setLlmError('Failed to connect to Ollama. Make sure it is running.')
    } finally {
      setLlmLoading(false)
    }
  }, [transcribedText, llmPrompt, llmModel, batchFileResults, selectedBatchFile])

  const handleOllamaLogin = useCallback(async () => {
    setOllamaLoginMsg('Opening browser for Ollama login...')
    try {
      const resp = await fetch(`${API_BASE}/api/llm/login`, { method: 'POST' })
      const data = await resp.json()
      if (data.success) {
        setOllamaLoginMsg('Logged in! Refresh model list to see cloud models.')
      } else {
        setOllamaLoginMsg(data.message || 'Login failed')
      }
    } catch {
      setOllamaLoginMsg('Failed to connect to backend')
    }
  }, [])

  const handlePullModel = useCallback(async () => {
    const model = pullModelName.trim()
    if (!model) return
    setPullStatus(`Pulling ${model}...`)
    try {
      const resp = await fetch(`${API_BASE}/api/llm/pull?model=${encodeURIComponent(model)}`, { method: 'POST' })
      const data = await resp.json()
      if (data.success) {
        setPullStatus(`✓ ${data.message}`)
        const modelsRes = await fetch(`${API_BASE}/api/llm/models`)
        const modelsData = await modelsRes.json()
        if (modelsData.success) setOllamaModels(modelsData.models)
      } else {
        setPullStatus(`✗ ${data.message}`)
      }
    } catch {
      setPullStatus('✗ Failed to pull model')
    }
  }, [pullModelName])

  const handleSaveDoc = useCallback(async () => {
    if (!outputPath) {
      setError('Please specify output path')
      return
    }

    if (!transcribedText) {
      setError('No text to save. Please transcribe an audio file first.')
      return
    }

    setIsSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API_BASE}/api/save-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcribedText, output_path: outputPath }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setSuccess(`Document saved to: ${data.file_path}`)
      } else {
        setError(data.detail || data.message || 'Failed to save document')
      }
    } catch (err) {
      setError('Failed to save document')
    } finally {
      setIsSaving(false)
    }
  }, [outputPath, transcribedText])

  const handleSaveLlmDoc = useCallback(async () => {
    if (!llmOutputPath) {
      setLlmError('Please specify output path')
      return
    }
    if (!llmResult) return
    setIsSavingLlm(true)
    setLlmError('')
    try {
      const resp = await fetch(`${API_BASE}/api/save-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: llmResult, output_path: llmOutputPath }),
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        setLlmError('')
        setSuccess(`LLM document saved to: ${data.file_path}`)
      } else {
        setLlmError(data.detail || data.message || 'Failed to save')
      }
    } catch {
      setLlmError('Failed to save document')
    } finally {
      setIsSavingLlm(false)
    }
  }, [llmOutputPath, llmResult])

  const handleOutputFileSelect = useCallback((e) => {
    const file = e.target.files[0]
    if (file) {
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      const dir = file.path ? file.path.replace(/[/\\][^/\\]+$/, '') : ''
      setOutputPath(`${dir}/${baseName}.doc`)
    }
  }, [])

  const handleLlmFileSelect = useCallback((e) => {
    const file = e.target.files[0]
    if (file) {
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      const dir = file.path ? file.path.replace(/[/\\][^/\\]+$/, '') : ''
      setLlmOutputPath(`${dir}/${baseName}.doc`)
    }
  }, [])

  const moveFileUp = useCallback((index) => {
    if (index <= 0) return
    setSelectedFiles(prev => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr
    })
  }, [])

  const moveFileDown = useCallback((index) => {
    setSelectedFiles(prev => {
      if (index >= prev.length - 1) return prev
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr
    })
  }, [])

  const formatFileSize = (bytes) => (bytes / (1024 * 1024)).toFixed(2)

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <span className="app-icon">♫</span>
            <h1>Orpheus</h1>
          </div>
        </div>
      </header>

      <section className="section">
        <h2 className="section-title">
          Select Audio Files
        </h2>
        
        <div className="file-input-container">
          <div className="file-input-wrapper">
            <div className="file-input">
              <input
                type="text"
                placeholder="Enter path to MP3 file or click Browse..."
                value={inputPath}
                onChange={handleInputPathChange}
              />
              <input
                type="file"
                ref={fileInputRef}
                accept={SUPPORTED_FORMATS}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                multiple
              />
            </div>
            <button className="browse-btn" onClick={handleBrowseInput}>
              Browse
            </button>
          </div>
        </div>

        {selectedFiles.length > 1 && (
          <section className="stats-card">
            <h2 className="section-title">
              Selected Files ({selectedFiles.length})
            </h2>
            <div className="file-list">
              {selectedFiles.map((f, i) => (
                <div key={i} className="file-list-item">
                  <span className="file-list-num">{i + 1}.</span>
                  <span className="file-list-name">{f.name}</span>
                  <span className="file-list-size">{(f.size / (1024 * 1024)).toFixed(2)} MB</span>
                  <div className="file-list-actions">
                    <button className="file-move-btn" onClick={() => moveFileUp(i)} disabled={i === 0} title="Move up">▲</button>
                    <button className="file-move-btn" onClick={() => moveFileDown(i)} disabled={i === selectedFiles.length - 1} title="Move down">▼</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {selectedFiles.length > 1 && (
          <section className="batch-toggle-card">
            <label className="batch-toggle-label">
              <span className="batch-toggle-text">Batch mode — save each file as separate .doc</span>
              <span className="toggle-switch" onClick={() => setBatchMode(!batchMode)}>
                <span className={`toggle-slider ${batchMode ? 'on' : ''}`} />
              </span>
            </label>
          </section>
        )}

        {audioInfo && selectedFiles.length === 1 && (
          <section className="stats-card">
            <h2 className="section-title">
              File Statistics
            </h2>
            <div className="stats-grid">
              <div className="stats-col">
                <div><strong>File:</strong> {selectedFiles[0].name}</div>
                <div><strong>Size:</strong> {audioInfo.file_size_mb} MB</div>
                <div><strong>Duration:</strong> {audioInfo.duration_formatted}</div>
              </div>
              <div className="stats-col">
                <div><strong>Channels:</strong> {audioInfo.channels}</div>
                <div><strong>Sample Rate:</strong> {audioInfo.sample_rate} Hz</div>
              </div>
            </div>
            {audioInfo.num_chunks > 1 && (
              <div className="chunks-info">
                <strong>File will be split into {audioInfo.num_chunks} parts</strong>
              </div>
            )}
          </section>
        )}

        {audioUrl && selectedFiles.length === 1 && (
          <section className="audio-player-card">
            <h2 className="section-title">
              Audio Player
            </h2>
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
              onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
              onEnded={() => setIsPlaying(false)}
            />
            <div className="player-controls">
              <button className="player-btn" onClick={() => skip(-10)}>⏮ -10s</button>
              <button className="player-btn" onClick={() => skip(-5)}>⏪ -5s</button>
              <button className="player-btn play-btn" onClick={togglePlay}>
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <button className="player-btn" onClick={() => skip(5)}>⏩ +5s</button>
              <button className="player-btn" onClick={() => skip(10)}>⏭ +10s</button>
            </div>
            <div className="player-timeline">
              <span className="time-label">{formatTime(currentTime)}</span>
              <div className="timeline-container">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="timeline-slider"
                />
                <div className="timeline-marks">
                  {Array.from({ length: 11 }, (_, i) => {
                    const time = (duration / 10) * i
                    return (
                      <span key={i} className="time-mark" style={{ left: `${i * 10}%` }}>
                        {formatTime(time)}
                      </span>
                    )
                  })}
                </div>
              </div>
              <span className="time-label">{formatTime(duration)}</span>
            </div>
          </section>
        )}

        {selectedFiles.length === 1 && (
          <section className="split-mode-card">
            <div className="split-mode-header">
              <button
                className="split-mode-btn"
                onClick={() => {
                  setShowManualSplit(!showManualSplit)
                }}
              >
                {showManualSplit ? 'Hide Manual Split' : 'Manual Split'}
              </button>
            </div>

            {showManualSplit && (
              <div className="split-container">
                <p className="split-hint">Click on timeline to add split markers</p>
                
                <div className="player-timeline">
                  <span className="time-label">{formatTime(0)}</span>
                  <div className="split-timeline" onClick={handleTimelineClick}>
                    <div className="split-timeline-bar">
                      <div className="split-timeline-progress" style={{ width: `${(currentTime / duration) * 100}%` }} />
                    </div>
                    <div className="timeline-marks">
                      {Array.from({ length: 11 }, (_, i) => {
                        const time = (duration / 10) * i
                        return (
                          <span key={i} className="time-mark" style={{ left: `${i * 10}%` }}>
                            {formatTime(time)}
                          </span>
                        )
                      })}
                    </div>
                    {splitMarkers.map((marker, i) => (
                      <div
                        key={i}
                        className="split-marker"
                        style={{ left: `${(marker / duration) * 100}%` }}
                        onClick={(e) => { e.stopPropagation(); removeSplitMarker(marker) }}
                      >
                        <span className="split-marker-label">{formatTimeFull(marker)}</span>
                      </div>
                    ))}
                  </div>
                  <span className="time-label">{formatTime(duration)}</span>
                </div>

                <div className="chunks-list">
                  {chunksToSend.map((chunk, i) => (
                    <div key={i} className="chunk-item">
                      <span className="chunk-num">#{i + 1}</span>
                      <span className="chunk-time">
                        {formatTimeFull(chunk.start)} → {formatTimeFull(chunk.end)}
                      </span>
                      <span className="chunk-duration">
                        ({((chunk.end || duration) - chunk.start).toFixed(1)}s)
                      </span>
                      <button className="chunk-remove" onClick={() => removeChunk(i)} title="Remove">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="cpu-card">
          <div className="cpu-header">
            <h2 className="section-title">
              CPU Cores
            </h2>
            <select
              className="cpu-select"
              value={cpuThreads}
              onChange={(e) => handleParallelModeChange(Number(e.target.value))}
              disabled={isSettingsLoading}
            >
              {[1, 2, 3, 4].map((cores) => (
                <option key={cores} value={cores}>{cores} core{cores > 1 ? 's' : ''}</option>
              ))}
            </select>
            <select
              className="cpu-select model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {isSettingsLoading && <span className="settings-loading">Applying...</span>}
          </div>
        </section>

        {isConverting && !batchId && (
          <div className="progress-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: totalChunks > 0 ? `${(currentChunk / totalChunks) * 100}%` : '5%' }} />
            </div>
            <span className="progress-text">{currentChunk} / {totalChunks} chunks</span>
          </div>
        )}

        {isConverting && batchId && batchProgress && (
          <div className="progress-container batch-progress">
            <div className="batch-progress-info">
              File {batchProgress.filesDone + 1} / {batchProgress.filesTotal} — {batchProgress.currentFile}
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: batchProgress.totalChunks > 0 ? `${(batchProgress.currentChunk / batchProgress.totalChunks) * 100}%` : '5%' }} />
            </div>
            <span className="progress-text">
              {batchProgress.currentChunk} / {batchProgress.totalChunks} chunks
            </span>
          </div>
        )}

        <button
          className="convert-btn"
          onClick={async () => {
            if (isConverting) {
              setIsStopping(true)
              try {
                await fetch(`${API_BASE}/api/stop`, { method: 'POST' })
              } finally {
                setIsStopping(false)
                setIsConverting(false)
              }
            } else {
              handleConvert()
            }
          }}
          disabled={selectedFiles.length === 0}
          style={{ marginTop: '1.5rem' }}
        >
          {isConverting ? (
            <>
              <span className="spinner" />
              {isStopping ? 'Stopping...' : 'STOP'}
            </>
          ) : selectedFiles.length > 1 ? (
            batchMode ? `Batch Convert ${selectedFiles.length} Files` : `Convert ${selectedFiles.length} Files`
          ) : (
            'Convert to Text'
          )}
        </button>
      </section>

      {batchFileResults.length > 0 && (
        <section className="result-container">
          <h2 className="section-title">
            Batch Results ({batchFileResults.length} files)
          </h2>
          <div className="batch-results-list">
            {batchFileResults.map((fr, i) => (
              <div key={i} className={`batch-result-item ${fr.success ? 'success' : 'fail'}`}>
                <div className="batch-result-header">
                  <span className="batch-result-icon">{fr.success ? '✓' : '✗'}</span>
                  <span className="batch-result-name">{fr.filename}</span>
                  {fr.runtime_seconds && (
                    <span className="batch-result-time">{fr.runtime_seconds.toFixed(1)}s</span>
                  )}
                </div>
                {fr.success && fr.doc_path && (
                  <div className="batch-result-doc">→ {fr.doc_path}</div>
                )}
                {!fr.success && (
                  <div className="batch-result-error">{fr.error}</div>
                )}
              </div>
            ))}
          </div>
          {runtime && (
            <div className="runtime-info">
              <strong>Total Runtime:</strong> {runtime}
            </div>
          )}
        </section>
      )}

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {transcribedText && (
        <section className="result-container">
          <h2 className="section-title">
            Transcription Result
          </h2>
          <div className="result-text">{transcribedText}</div>
          {runtime && (
            <div className="runtime-info">
              <strong>Runtime:</strong> {runtime}
            </div>
          )}
          <div className="save-doc-inline">
            <div className="save-doc-row">
              <input
                className="llm-pull-input"
                placeholder="Enter filename to save .doc file"
                value={outputPath}
                onChange={handleOutputPathChange}
              />
              <button className="llm-save-btn" onClick={handleSaveDoc} disabled={!outputPath || isSaving}>
                {isSaving ? 'Saving...' : 'Save as DOC'}
              </button>
            </div>
            <input
              type="file"
              ref={outputFileRef}
              onChange={handleOutputFileSelect}
              style={{ display: 'none' }}
              webkitdirectory
            />
            <button className="browse-btn browse-folder-btn" onClick={handleBrowseOutput}>
              Browse Folder
            </button>
          </div>
        </section>
      )}

      {(transcribedText || batchFileResults.length > 0) && (
        <section className="llm-card">
          <h2 className="section-title">
            Enhance with LLM (via Ollama)
          </h2>
          <div className="llm-login-row">
            <button className="llm-login-btn" onClick={handleOllamaLogin}>
              Login to Ollama Cloud
            </button>
            {ollamaLoginMsg && <span className="llm-login-msg">{ollamaLoginMsg}</span>}
          </div>
          <div className="llm-pull-row">
            <input
              className="llm-pull-input"
              placeholder="Model name (e.g. minimax-m3:cloud)"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
            />
            <button className="llm-login-btn" onClick={handlePullModel} disabled={!pullModelName.trim()}>
              Pull Model
            </button>
            {pullStatus && <span className="llm-login-msg">{pullStatus}</span>}
          </div>
          <div className="llm-row">
            <div className="llm-model-row">
              <input
                className="llm-model-input"
                placeholder="Model name (e.g. minimax-m3:cloud)"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
              />
              {ollamaModels.length > 0 && (
                <select
                  className="cpu-select llm-select"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                >
                  <option value="">— select model —</option>
                  {ollamaModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
              <button className="llm-refresh-btn" onClick={checkModelStatus} title="Refresh model list">
                ⟳
              </button>
            </div>
          </div>
          {batchFileResults.length > 0 && (
            <div className="llm-row">
              <label className="llm-file-label">Source file:</label>
              <select
                className="cpu-select llm-select"
                value={selectedBatchFile}
                onChange={(e) => setSelectedBatchFile(Number(e.target.value))}
              >
                {batchFileResults.map((fr, i) => (
                  <option key={i} value={i} disabled={!fr.success}>{fr.filename} {fr.success ? '' : '(failed)'}</option>
                ))}
              </select>
            </div>
          )}
          <textarea
            className="llm-prompt"
            placeholder="Enter your prompt (e.g. Summarize this text, Fix grammar, Translate to Russian...)"
            value={llmPrompt}
            onChange={(e) => setLlmPrompt(e.target.value)}
            rows={3}
          />
          <button
            className="convert-btn llm-btn"
            onClick={handleLlmEnhance}
            disabled={llmLoading || !llmPrompt.trim()}
          >
            {llmLoading ? (
              <><span className="spinner" /> Enhancing...</>
            ) : (
              'Enhance Text'
            )}
          </button>
          {llmError && <div className="error-message">{llmError}</div>}
          {llmResult && (
            <div className="llm-result">
              <div className="llm-result-text">{llmResult}</div>
              <div className="llm-save-row">
                <input
                  className="llm-pull-input"
                  placeholder="Enter filename to save .doc file"
                  value={llmOutputPath}
                  onChange={(e) => setLlmOutputPath(e.target.value)}
                />
                <button className="llm-save-btn" onClick={handleSaveLlmDoc} disabled={isSavingLlm || !llmOutputPath.trim()}>
                  {isSavingLlm ? 'Saving...' : 'Save as DOC'}
                </button>
              </div>
              <input
                type="file"
                ref={llmFileRef}
                onChange={handleLlmFileSelect}
                style={{ display: 'none' }}
                webkitdirectory
              />
              <button className="browse-folder-btn" onClick={() => llmFileRef.current?.click()} style={{ marginTop: '0.5rem' }}>
                Browse Folder
              </button>
            </div>
          )}
        </section>
      )}

      {showLogs && (
        <section className="logs-container">
          <h2 className="section-title">Transcription Logs</h2>
          <table className="logs-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>File</th>
                <th>Duration</th>
                <th>Run Time</th>
                <th>Chunks</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.number}>
                  <td>{log.number}</td>
                  <td>{log.date} {log.time}</td>
                  <td>{log.file_name}</td>
                  <td>{log.duration}s</td>
                  <td>{log.run_time}s</td>
                  <td>{log.num_chunks}</td>
                  <td>{log.model || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="footer">
        <p>Orpheus</p>
      </footer>
    </div>
  )
}

export default App