import { useState, useEffect, useRef, useCallback } from 'react'

const API_BASE = ''
const SUPPORTED_FORMATS = '.mp3,.wav,.flac,.m4a,.ogg,audio/*'

function App() {
  const [inputPath, setInputPath] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [transcribedText, setTranscribedText] = useState('')
  const [audioInfo, setAudioInfo] = useState(null)
  const [isConverting, setIsConverting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading model...' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [parallelMode, setParallelMode] = useState(false)
  const [cpuThreads, setCpuThreads] = useState(1)
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
  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const outputFileRef = useRef(null)

  const checkModelStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/model-info`)
      const data = await response.json()
      if (data.loaded) {
        setStatus({ type: 'ready', message: 'Model ready' })
      } else {
        setStatus({ type: 'loading', message: 'Model will load on first use' })
      }
      
      const settingsRes = await fetch(`${API_BASE}/api/settings`)
      const settingsData = await settingsRes.json()
      setCpuThreads(settingsData.cpu_threads || 1)
      setParallelMode((settingsData.cpu_threads || 1) > 1)
    } catch {
      setStatus({ type: 'error', message: 'Cannot connect to API' })
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
    const file = e.target.files[0]
    if (!file) return

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    const url = URL.createObjectURL(file)
    setAudioUrl(url)
    setSelectedFile(file)
    setInputPath(file.path || file.name)
    setIsPlaying(false)
    setCurrentTime(0)
    resetState()
    await fetchAudioInfo(file)
  }, [resetState, fetchAudioInfo, audioUrl])

  const handleInputPathChange = useCallback((e) => {
    setInputPath(e.target.value)
    setSelectedFile(null)
    setAudioInfo(null)
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
    if (!selectedFile) {
      setError('Please select an audio file')
      return
    }

    setIsConverting(true)
    setError('')
    setSuccess('')
    setTranscribedText('')
    setCurrentChunk(0)
    setTotalChunks(0)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

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
              setStatus({ type: 'ready', message: `Transcription complete! (${resultData.runtime_formatted})` })
            } else {
              setError(resultData.error || 'Transcription failed')
              setStatus({ type: 'error', message: resultData.error || 'Transcription failed' })
              if (resultData.error?.includes('stopped')) {
                setTranscribedText('')
              }
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
  }, [selectedFile])

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

  const handleOutputFileSelect = useCallback((e) => {
    const file = e.target.files[0]
    if (file) {
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      const dir = file.path ? file.path.replace(/[/\\][^/\\]+$/, '') : ''
      setOutputPath(`${dir}/${baseName}.doc`)
    }
  }, [])

  const getStatusClass = useCallback(() => {
    const statusClasses = {
      loading: 'status-loading',
      ready: 'status-ready',
      error: 'status-error'
    }
    return statusClasses[status.type] || ''
  }, [status.type])

  const formatFileSize = (bytes) => (bytes / (1024 * 1024)).toFixed(2)

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <span className="app-icon">🎵</span>
            <h1>Orpheus</h1>
          </div>
          <p>MP3 to Text converter using GigaAM-v3</p>
          <span className="model-badge">GigaAM-v3 by Sber</span>
        </div>
      </header>

      <div className={`status-indicator ${getStatusClass()}`}>
        <strong>Status:</strong> {status.message}
      </div>

      <section className="section">
        <h2 className="section-title">
          Select Audio File
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
              />
            </div>
            <button className="browse-btn" onClick={handleBrowseInput}>
              Browse
            </button>
          </div>
        </div>

        {audioInfo && selectedFile && (
          <section className="stats-card">
            <h2 className="section-title">
              File Statistics
            </h2>
            <div className="stats-grid">
              <div className="stats-col">
                <div><strong>File:</strong> {selectedFile.name}</div>
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

        {audioUrl && (
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

        <section className="cpu-card">
          <div className="cpu-header">
            <h2 className="section-title">
              CPU Cores
            </h2>
            <div className="cpu-buttons">
              {[1, 2, 3, 4].map((cores) => (
                <button
                  key={cores}
                  className={`cpu-btn ${cpuThreads === cores ? 'active' : ''}`}
                  onClick={() => handleParallelModeChange(cores)}
                  disabled={isSettingsLoading}
                >
                  {cores}
                </button>
              ))}
            </div>
            {isSettingsLoading && <span className="settings-loading">Applying...</span>}
          </div>
        </section>

        {isConverting && (
          <div className="progress-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: totalChunks > 0 ? `${(currentChunk / totalChunks) * 100}%` : '5%' }} />
            </div>
            <span className="progress-text">{currentChunk} / {totalChunks} chunks</span>
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
          disabled={!selectedFile}
          style={{ marginTop: '1.5rem' }}
        >
          {isConverting ? (
            <>
              <span className="spinner" />
              {isStopping ? 'Stopping...' : 'STOP'}
            </>
          ) : (
            'Convert to Text'
          )}
        </button>
      </section>

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
        </section>
      )}

      {transcribedText && (
        <section className="section" style={{ marginTop: '1.5rem' }}>
          <h2 className="section-title">
            Save as DOC
          </h2>
          
          <div className="file-input-container">
            <div className="file-input-wrapper">
              <div className="file-input">
                <input
                  type="text"
                  placeholder="Enter filename to save .doc file"
                  value={outputPath}
                  onChange={handleOutputPathChange}
                />
              </div>
              <button className="browse-btn" onClick={handleBrowseOutput}>
                Browse
              </button>
            </div>
            <input
              type="file"
              ref={outputFileRef}
              onChange={handleOutputFileSelect}
              style={{ display: 'none' }}
              webkitdirectory
            />
          </div>

          <button
            className="convert-btn"
            onClick={handleSaveDoc}
            disabled={!outputPath || isSaving}
            style={{ marginTop: '1rem', background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)' }}
          >
            {isSaving ? (
              <>
                <span className="spinner" />
                Saving...
              </>
            ) : (
              'Save as DOC'
            )}
          </button>
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
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="footer">
        <p>Powered by GigaAM-v3 model from SberDevices</p>
      </footer>
    </div>
  )
}

export default App