import React, { useState, useRef } from 'react';

const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  title: {
    fontSize: '36px',
    fontWeight: 'bold',
    marginBottom: '10px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    color: '#888',
    fontSize: '16px',
  },
  card: {
    background: '#2a2a2a',
    borderRadius: '16px',
    padding: '30px',
    marginBottom: '20px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#aaa',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  fileInputWrapper: {
    position: 'relative',
  },
  fileInput: {
    width: '100%',
    padding: '20px',
    border: '2px dashed #444',
    borderRadius: '12px',
    background: '#222',
    color: '#fff',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  button: {
    width: '100%',
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: '600',
    color: '#fff',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    marginTop: '20px',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginTop: '20px',
  },
  statBox: {
    background: '#333',
    padding: '20px',
    borderRadius: '12px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#667eea',
  },
  statLabel: {
    fontSize: '12px',
    color: '#888',
    marginTop: '5px',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '16px',
    background: '#222',
    border: '2px solid #444',
    borderRadius: '10px',
    color: '#fff',
    outline: 'none',
    transition: 'border-color 0.3s ease',
  },
  rangeContainer: {
    marginTop: '10px',
  },
  rangeValue: {
    textAlign: 'center',
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: '10px',
  },
  rangeLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#666',
    fontSize: '12px',
  },
  range: {
    width: '100%',
    height: '8px',
    borderRadius: '4px',
    outline: 'none',
    WebkitAppearance: 'none',
    background: '#333',
    marginTop: '10px',
  },
  resultCard: {
    background: '#1a3a1a',
    border: '1px solid #2a5a2a',
    borderRadius: '12px',
    padding: '20px',
    marginTop: '20px',
  },
  resultTitle: {
    color: '#4ade80',
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '15px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  fileList: {
    listStyle: 'none',
    padding: 0,
  },
  fileItem: {
    background: '#222',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  error: {
    background: '#3a1a1a',
    border: '1px solid #5a2a2a',
    borderRadius: '12px',
    padding: '16px',
    marginTop: '20px',
    color: '#ff6b6b',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#888',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #333',
    borderTop: '3px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px',
  },
};

const API_URL = 'http://localhost:8000';

function formatError(err) {
  if (typeof err === 'string') return err;
  if (err?.message) return formatError(err.message);
  if (err?.detail) return formatError(err.detail);
  if (Array.isArray(err)) return err.map(formatError).join(', ');
  if (typeof err === 'object') return JSON.stringify(err);
  return String(err);
}

function App() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [numParts, setNumParts] = useState(2);
  const [outputDir, setOutputDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.mp3')) {
      setError('Please select an MP3 file');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Server error: ${response.status} - ${text}`);
      }

      if (!response.ok) {
        throw new Error(data.detail || `Upload failed (${response.status})`);
      }

      setFileInfo(data);
      setStep(2);
    } catch (err) {
      setError(formatError(err));
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCut = async () => {
    if (!outputDir.trim()) {
      setError('Please enter an output directory path');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/cut/${fileInfo.file_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          num_parts: numParts,
          output_dir: outputDir,
        }),
      });

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Server error: ${response.status} - ${text}`);
      }

      if (!response.ok) {
        throw new Error(data.detail || `Cut failed (${response.status})`);
      }

      setResult(data);
      setStep(3);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFile(null);
    setFileInfo(null);
    setNumParts(2);
    setOutputDir('');
    setError(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderStep1 = () => (
    <div style={styles.card}>
      <label style={styles.label}>Select MP3 File</label>
      <div style={styles.fileInputWrapper}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3"
          onChange={handleFileChange}
          style={styles.fileInput}
          disabled={loading}
        />
      </div>
      {file && (
        <div style={{ marginTop: '15px', color: '#888' }}>
          Selected: {file.name}
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <>
      <div style={styles.card}>
        <label style={styles.label}>File Statistics</label>
        <div style={styles.statsContainer}>
          <div style={styles.statBox}>
            <div style={styles.statValue}>{fileInfo.duration_formatted}</div>
            <div style={styles.statLabel}>Duration</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statValue}>{fileInfo.filename}</div>
            <div style={styles.statLabel}>Filename</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statValue}>{fileInfo.file_size_formatted}</div>
            <div style={styles.statLabel}>File Size</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statValue}>{fileInfo.channels}</div>
            <div style={styles.statLabel}>Channels</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statValue}>{fileInfo.sample_width_formatted}</div>
            <div style={styles.statLabel}>Sample Width</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statValue}>{fileInfo.frame_rate_formatted}</div>
            <div style={styles.statLabel}>Frame Rate</div>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <label style={styles.label}>Number of Parts (2-10)</label>
        <div style={styles.rangeContainer}>
          <div style={styles.rangeValue}>{numParts}</div>
          <input
            type="range"
            min="2"
            max="10"
            value={numParts}
            onChange={(e) => setNumParts(parseInt(e.target.value))}
            style={styles.range}
          />
          <div style={styles.rangeLabels}>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
            <span>6</span>
            <span>7</span>
            <span>8</span>
            <span>9</span>
            <span>10</span>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <label style={styles.label}>Output Directory Path</label>
        <input
          type="text"
          value={outputDir}
          onChange={(e) => setOutputDir(e.target.value)}
          placeholder="e.g., C:\Users\YourName\Music\Output"
          style={styles.input}
        />
        <p style={{ marginTop: '10px', color: '#666', fontSize: '13px' }}>
          Enter the full path where cut MP3 parts will be saved
        </p>
      </div>

      <button
        style={{
          ...styles.button,
          ...(loading || !outputDir.trim() ? styles.buttonDisabled : {}),
        }}
        onClick={handleCut}
        disabled={loading || !outputDir.trim()}
      >
        {loading ? 'Processing...' : `Cut into ${numParts} Parts`}
      </button>
    </>
  );

  const renderStep3 = () => (
    <>
      <div style={styles.resultCard}>
        <div style={styles.resultTitle}>
          <span style={{ fontSize: '24px' }}>&#10003;</span>
          Success! {result.num_parts} parts created
        </div>
        <ul style={styles.fileList}>
          {result.files.map((file, index) => (
            <li key={index} style={styles.fileItem}>
              <span>{file.filename}</span>
              <span style={{ color: '#666', fontSize: '13px' }}>
                {file.start_time} - {file.end_time}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button style={styles.button} onClick={handleReset}>
        Cut Another File
      </button>
    </>
  );

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 50%;
          cursor: pointer;
        }
        input[type="file"]::file-selector-button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          margin-right: 15px;
          font-weight: 600;
        }
        input[type="text"]:focus {
          border-color: #667eea;
        }
        button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }
      `}</style>

      <div style={styles.header}>
        <h1 style={styles.title}>Orpheus</h1>
        <p style={styles.subtitle}>Split your MP3 files into equal parts</p>
      </div>

      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          Processing your file...
        </div>
      )}

      {!loading && step === 1 && renderStep1()}
      {!loading && step === 2 && renderStep2()}
      {!loading && step === 3 && renderStep3()}

      {error && (
        <div style={styles.error}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}

export default App;
