import { useState, useRef, useEffect } from 'react';
import { cosmosAPI, AnalysisResponse, EventData } from './services/cosmosAPI';
import Annotate from './components/Annotate';

// Custom SVG icons to avoid content blocker issues
const PlayIcon = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="5,3 19,12 5,21" />
  </svg>
);

const PauseIcon = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const UploadIcon = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

console.log('App component loaded');

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeTab, setActiveTab] = useState<'preview' | 'json'>('preview');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previousVideoUrlRef = useRef<string | null>(null);

  const [userPrompt, setUserPrompt] = useState("Give me all the goals in this video");
  const [systemPrompt, setSystemPrompt] = useState(`You are a professional football analyst. Analyze the video content and provide detailed insights based on what you observe. Focus on the user's specific request and provide accurate analysis.`);

  // simple app-level routing
  const [currentPage, setCurrentPage] = useState<'analyze' | 'annotate'>('analyze');

  const togglePlay = async () => {
    if (videoRef.current) {
      try {
        if (isPlaying) {
          videoRef.current.pause();
          setIsPlaying(false);
        } else {
          await videoRef.current.play();
          setIsPlaying(true);
        }
      } catch (error) {
        console.log('Video play/pause error:', error);
        // Handle autoplay restrictions or other errors gracefully
        setIsPlaying(false);
      }
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current && videoDuration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const newTime = percentage * videoDuration;
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  const handleVideoPlay = () => {
    setIsPlaying(true);
  };

  const handleVideoPause = () => {
    setIsPlaying(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      // Clean up previous video URL if it exists
      if (previousVideoUrlRef.current) {
        URL.revokeObjectURL(previousVideoUrlRef.current);
      }
      setIsUploading(true);
      // Simulate upload process
      setTimeout(() => {
        setUploadedFile(file);
        const url = URL.createObjectURL(file);
        previousVideoUrlRef.current = videoUrl; // Store current URL for cleanup
        setVideoUrl(url);
        setIsUploading(false);
      }, 1500);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Check backend status only when on Analyze page
  useEffect(() => {
    let cancelled = false;
    const checkBackendStatus = async () => {
      const isReady = await cosmosAPI.isReady();
      if (!cancelled) setBackendStatus(isReady ? 'ready' : 'error');
    };
    if (currentPage === 'analyze') checkBackendStatus();
    return () => { cancelled = true; };
  }, [currentPage]);

  // Analyze video with Cosmos model
  const analyzeVideo = async () => {
    if (!uploadedFile) {
      alert('Please upload a video first');
      return;
    }

    if (!userPrompt.trim()) {
      alert('Please enter a user prompt');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await cosmosAPI.analyzeVideo({
        prompt: userPrompt,
        systemPrompt: systemPrompt,
        videoFile: uploadedFile
      });
      setAnalysisResult(result);
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Please check if the backend is running.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Cleanup video URL when component unmounts
  useEffect(() => {
    return () => {
      if (previousVideoUrlRef.current) {
        URL.revokeObjectURL(previousVideoUrlRef.current);
      }
    };
  }, []);

  // current page title no longer shown in header; keep for potential future use if needed

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100">
      {/* Single Header with NVIDIA logo, nav, and Cosmos API status */}
      <header className="relative border-b border-gray-800">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#76B900]/10 via-transparent to-[#76B900]/10" />
        <div className="backdrop-blur supports-[backdrop-filter]:bg-[#0d0d0d]/70">
          <div className="max-w-[1600px] mx-auto px-6 py-4 grid grid-cols-[auto,1fr,auto] items-center gap-6">
            {/* Left: NVIDIA logo */}
            <div className="flex items-center">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/2/21/Nvidia_logo.svg"
                alt="NVIDIA"
                className="h-6 md:h-7 w-auto opacity-90 hover:opacity-100 transition invert brightness-0"
                loading="eager"
                decoding="async"
              />
            </div>
            {/* Center: Nav */}
            <nav className="justify-self-center relative flex items-center gap-1 p-1 rounded-lg bg-[#0f0f0f] border border-gray-800">
              <button
                onClick={() => setCurrentPage('analyze')}
                className={`px-4 py-2 rounded-md text-sm transition relative ${currentPage === 'analyze' ? 'text-black' : 'text-gray-300 hover:text-white'}`}
              >
                <span className={`${currentPage === 'analyze' ? 'relative z-10' : ''}`}>Analyze</span>
                {currentPage === 'analyze' && (
                  <span className="absolute inset-0 -z-0 rounded-md bg-gradient-to-r from-[#76B900] to-[#87ca00] shadow-[0_0_20px_rgba(118,185,0,0.35)]" />
                )}
              </button>
              <button
                onClick={() => setCurrentPage('annotate')}
                className={`px-4 py-2 rounded-md text-sm transition relative ${currentPage === 'annotate' ? 'text-black' : 'text-gray-300 hover:text-white'}`}
              >
                <span className={`${currentPage === 'annotate' ? 'relative z-10' : ''}`}>Annotate</span>
                {currentPage === 'annotate' && (
                  <span className="absolute inset-0 -z-0 rounded-md bg-gradient-to-r from-[#76B900] to-[#87ca00] shadow-[0_0_20px_rgba(118,185,0,0.35)]" />
                )}
              </button>
            </nav>
            {/* Right: status */}
            <div className="flex items-center gap-3 justify-self-end">
              <div className={`w-2.5 h-2.5 rounded-full ${
                backendStatus === 'ready' ? 'bg-green-500' : 
                backendStatus === 'checking' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <span className="text-sm text-gray-400">
                Cosmos API: {
                  backendStatus === 'ready' ? 'Ready' :
                  backendStatus === 'checking' ? 'Checking...' : 'Offline'
                }
              </span>
            </div>
          </div>
        </div>
      </header>

      {currentPage === 'annotate' ? (
        <Annotate />
      ) : (
        <div className="max-w-[1600px] mx-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-6">
            {/* Left Column - Video Player */}
            <div className="space-y-4">
              {/* Video Frame Card */}
              <div className="bg-[#121212] border-2 border-transparent rounded-lg shadow-lg overflow-hidden relative group hover:border-[#76B900] transition-all duration-300 ease-in-out hover:shadow-[0_0_20px_rgba(118,185,0,0.3)] hover:shadow-lg">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#76B900]/20 via-transparent to-[#76B900]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10 aspect-video bg-black relative flex items-center justify-center">
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-cover"
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onEnded={handleVideoEnded}
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onClick={togglePlay}
                  />
                ) : uploadedFile ? (
                  <div className="text-center">
                    <div className="text-[#76B900] text-lg font-semibold mb-2">Video Loaded!</div>
                    <div className="text-gray-400 text-sm">{uploadedFile.name}</div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-gray-500 text-sm mb-4">No video uploaded</div>
                    <button
                      onClick={triggerFileUpload}
                      disabled={isUploading}
                      className="px-6 py-3 bg-gradient-to-r from-[#76B900] to-[#87ca00] hover:from-[#87ca00] hover:to-[#76B900] text-black font-semibold rounded-lg transition-all duration-300 flex items-center gap-2 mx-auto hover:scale-105 hover:shadow-[0_0_20px_rgba(118,185,0,0.4)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {isUploading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <UploadIcon size={20} />
                          Upload Video
                        </>
                      )}
                    </button>
                  </div>
                )}
                </div>
              </div>
              
              {/* Video Controls Card */}
              <div className="bg-[#121212] border-2 border-transparent rounded-lg shadow-lg p-4 relative group hover:border-[#76B900] transition-all duration-300 ease-in-out hover:shadow-[0_0_20px_rgba(118,185,0,0.3)] hover:shadow-lg">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#76B900]/10 via-transparent to-[#76B900]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="w-10 h-10 rounded-full bg-[#76B900] hover:bg-[#87ca00] transition-all duration-300 flex items-center justify-center text-black hover:scale-110 hover:shadow-[0_0_20px_rgba(118,185,0,0.5)] active:scale-95"
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} className="ml-0.5" />}
                    </button>
                    <div className="flex-1">
                      <div
                        className="h-2 bg-gray-800 rounded-full cursor-pointer relative hover:h-3 transition-all duration-300 group"
                        onClick={handleTimelineClick}
                      >
                        <div
                          className="h-full bg-gradient-to-r from-[#76B900] to-[#87ca00] rounded-full transition-all duration-300 group-hover:shadow-[0_0_10px_rgba(118,185,0,0.5)]"
                          style={{ width: `${videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-gray-400">
                        <span>{Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}</span>
                        <span>{Math.floor(videoDuration / 60)}:{String(Math.floor(videoDuration % 60)).padStart(2, '0')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* System Prompt Card moved under video */}
              <div className="bg-[#121212] border-2 border-transparent rounded-lg shadow-lg p-5 relative group hover:border-[#76B900] transition-all duration-300 ease-in-out hover:shadow-[0_0_20px_rgba(118,185,0,0.3)] hover:shadow-lg hover:scale-[1.02]">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#76B900]/10 via-transparent to-[#76B900]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <h2 className="text-lg font-semibold mb-3 text-[#76B900] group-hover:text-white transition-colors duration-300">System Prompt</h2>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#76B900] focus:border-transparent"
                    rows={6}
                    placeholder="Enter system instructions for the AI..."
                  />
                  <div className="text-xs text-gray-400 mt-2 text-right">{systemPrompt.length}/4000</div>
                </div>
              </div>
            </div>

            {/* Right Column - Prompts and Output */}
            <div className="space-y-6">
              {/* User Prompt Card */}
              <div className="bg-[#121212] border-2 border-transparent rounded-lg shadow-lg p-5 relative group hover:border-[#76B900] transition-all duration-300 ease-in-out hover:shadow-[0_0_20px_rgba(118,185,0,0.3)] hover:shadow-lg hover:scale-[1.02]">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#76B900]/10 via-transparent to-[#76B900]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <h2 className="text-lg font-semibold mb-3 text-[#76B900] group-hover:text-white transition-colors duration-300">User Prompt</h2>
                  <div className="mb-2">
                    <p className="text-xs text-gray-400 mb-1">Examples: "Give me all the goals", "Show me all penalties", "Find all yellow cards"</p>
                  </div>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#76B900] focus:border-transparent"
                  rows={2}
                  placeholder="Enter your football analysis request..."
                />
                  <div className="text-xs text-gray-400 mt-2 text-right">{userPrompt.length}/250</div>
                </div>
              </div>


              {/* Submit Button Card */}
              <div className="bg-[#121212] border-2 border-transparent rounded-lg shadow-lg p-5 relative group hover:border-[#76B900] transition-all duration-300 ease-in-out hover:shadow-[0_0_20px_rgba(118,185,0,0.3)] hover:shadow-lg hover:scale-[1.02]">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#76B900]/10 via-transparent to-[#76B900]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <button
                    onClick={analyzeVideo}
                    disabled={isAnalyzing || !uploadedFile || !userPrompt.trim() || backendStatus !== 'ready'}
                    className="w-full px-6 py-4 bg-gradient-to-r from-[#76B900] to-[#87ca00] hover:from-[#87ca00] hover:to-[#76B900] text-black font-semibold rounded-lg transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(118,185,0,0.4)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                  >
                    {isAnalyzing ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        Analyzing with Cosmos...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 12l2 2 4-4"/>
                          <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"/>
                          <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"/>
                          <path d="M12 3c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3"/>
                          <path d="M12 21c0-1 1-3 3-3s3 2 3 3-1 3-3 3-3-2-3-3"/>
                        </svg>
                        Analyze Video with Cosmos
                      </div>
                    )}
                  </button>
                  {!uploadedFile && (
                    <p className="text-xs text-red-400 mt-2 text-center">Please upload a video first</p>
                  )}
                  {!userPrompt.trim() && (
                    <p className="text-xs text-red-400 mt-2 text-center">Please enter a user prompt</p>
                  )}
                  {backendStatus !== 'ready' && (
                    <p className="text-xs text-red-400 mt-2 text-center">Backend not ready</p>
                  )}
                </div>
              </div>

              {/* Output Section */}
              <div className="bg-[#121212] border-2 border-transparent rounded-lg shadow-lg overflow-hidden relative group hover:border-[#76B900] transition-all duration-300 ease-in-out hover:shadow-[0_0_20px_rgba(118,185,0,0.3)] hover:shadow-lg hover:scale-[1.02]">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#76B900]/10 via-transparent to-[#76B900]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                <div className="border-b border-gray-800">
                  <div className="flex">
                    <button
                      onClick={() => setActiveTab('preview')}
                      className={`px-6 py-3 text-sm font-medium transition-all duration-300 relative hover:bg-[#76B900]/10 ${
                        activeTab === 'preview'
                          ? 'text-[#76B900]'
                          : 'text-gray-400 hover:text-gray-300'
                      }`}
                    >
                      Preview
                      {activeTab === 'preview' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#76B900] animate-pulse" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('json')}
                      className={`px-6 py-3 text-sm font-medium transition-all duration-300 relative hover:bg-[#76B900]/10 ${
                        activeTab === 'json'
                          ? 'text-[#76B900]'
                          : 'text-gray-400 hover:text-gray-300'
                      }`}
                    >
                      JSON
                      {activeTab === 'json' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#76B900] animate-pulse" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  {activeTab === 'preview' ? (
                    <div className="space-y-4">
                      {analysisResult ? (
                        <>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-300 mb-2">Analysis Summary</h3>
                            <p className="text-sm text-gray-300 mb-3">{analysisResult.answer}</p>
                            {(analysisResult as AnalysisResponse & { events?: EventData[] }).events && (
                              <div className="bg-[#1a1a1a] rounded-lg p-3 mb-3">
                                <h4 className="text-xs font-semibold text-[#76B900] mb-2">Events Detected:</h4>
                                <div className="space-y-1">
                                  {(analysisResult as AnalysisResponse & { events?: EventData[] }).events?.map((event: EventData, index: number) => (
                                    <div key={index} className="flex items-center gap-2 text-xs">
                                      <span className="w-2 h-2 bg-[#76B900] rounded-full"></span>
                                      <span className="text-gray-300">{event.event_type}</span>
                                      <span className="text-gray-400">({event.start_time} - {event.end_time})</span>
                                      <span className="text-gray-400">Player #{event.player_jersey}</span>
                                      <span className="text-gray-400">{event.team}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="border-t border-gray-800 pt-4">
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <span className="text-gray-400">Confidence:</span>
                                <span className="text-[#76B900] ml-2">{(analysisResult.confidence * 100).toFixed(1)}%</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Model:</span>
                                <span className="text-gray-300 ml-2">{analysisResult.actor}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : isAnalyzing ? (
                        <div className="text-center py-8">
                          <div className="w-8 h-8 border-2 border-[#76B900] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                          <p className="text-gray-400">Analyzing video with NVIDIA NIM Cosmos-Reason1-7B...</p>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-gray-500">Upload a video and click "Analyze Video" to get NVIDIA NIM AI-powered analysis</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <pre className="text-xs text-gray-300 overflow-x-auto font-mono">
                      <code>{analysisResult ? JSON.stringify(analysisResult, null, 2) : 'No analysis data available'}</code>
                    </pre>
                  )}
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}

export default App;
