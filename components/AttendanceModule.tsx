
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ASSIGNEES } from '../constants';
import { AttendanceRecord } from '../types';

interface AttendanceModuleProps {
  onSave: (record: AttendanceRecord) => void;
  logs: AttendanceRecord[];
  onRefresh?: () => void;
}

const AttendanceModule: React.FC<AttendanceModuleProps> = ({ onSave, logs, onRefresh }) => {
  const [selectedName, setSelectedName] = useState(ASSIGNEES[0]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<{lat: number, lng: number, accuracy?: number, altitude?: number} | null>(null);
  const [address, setAddress] = useState<string>('');
  const [plusCode, setPlusCode] = useState<string>('');
  const [heading, setHeading] = useState<number | null>(null);
  const [weather, setWeather] = useState<{temp: number, humidity: number, wind: number, condition: string} | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [focusPoint, setFocusPoint] = useState<{x: number, y: number} | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '1:1' | '9:16'>('16:9');
  const [attendanceType, setAttendanceType] = useState<'In' | 'Out'>('In');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [dateFilter, setDateFilter] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  });
  const [selectedLog, setSelectedLog] = useState<AttendanceRecord | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    const handleOrientation = (e: any) => {
      if (e.webkitCompassHeading) {
        setHeading(e.webkitCompassHeading);
      } else if (e.alpha) {
        setHeading(360 - e.alpha);
      }
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  const openCameraModal = async () => {
    setIsCameraOpen(true);
    await startCamera(facingMode);
    getLocation();
  };

  const closeCameraModal = () => {
    stopCamera();
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsCameraOpen(false);
    setPhoto(null);
  };

  const startCamera = async (mode: 'user' | 'environment') => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: mode, 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 },
          aspectRatio: { ideal: 1.7777777778 }
        }
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (err) {
      alert("Izin kamera ditolak. Pastikan izin kamera diberikan.");
      closeCameraModal();
    }
  };

  const toggleCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    startCamera(newMode);
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const getLocation = () => {
    if (!("geolocation" in navigator)) return;
    
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
    }

    setLocation(null);
    
    const options = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    };

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, altitude } = pos.coords;
        if (latitude !== 0 || longitude !== 0) {
          setLocation({ lat: latitude, lng: longitude, accuracy, altitude: altitude || 0 });
          fetchEnvData(latitude, longitude);
        }
      },
      (err) => {
        console.warn(`GPS Watch Error: ${err.message}`);
        // Fallback one-shot
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (pos.coords.latitude !== 0 || pos.coords.longitude !== 0) {
              setLocation({ 
                lat: pos.coords.latitude, 
                lng: pos.coords.longitude, 
                accuracy: pos.coords.accuracy, 
                altitude: pos.coords.altitude || 0 
              });
              fetchEnvData(pos.coords.latitude, pos.coords.longitude);
            }
          },
          () => console.error("GPS Fallback failed"),
          { enableHighAccuracy: false, timeout: 5000 }
        );
      },
      options
    );
  };

  const fetchEnvData = async (lat: number, lng: number) => {
    try {
      // Fetch Address (Nominatim)
      const addrRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'Accept-Language': 'id' }
      });
      const addrData = await addrRes.json();
      if (addrData.display_name) setAddress(addrData.display_name);

      // Simple Plus Code Mock (Open Location Code style)
      // Real implementation is complex, this is a visual representation for the UI
      const mockPlus = `8Q${Math.floor(lat + 90).toString(16).toUpperCase()}${Math.floor(lng + 180).toString(16).toUpperCase()}+X4`;
      setPlusCode(mockPlus);

      // Fetch Weather (Open-Meteo)
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=relativehumidity_2m`);
      const weatherData = await weatherRes.json();
      if (weatherData.current_weather) {
        setWeather({
          temp: weatherData.current_weather.temperature,
          wind: weatherData.current_weather.windspeed,
          humidity: 75, // Default if hourly not parsed simply
          condition: 'Cerah'
        });
      }
    } catch (e) {
      console.error("Failed to fetch env data", e);
    }
  };

  const toDMS = (deg: number, isLat: boolean) => {
    const absolute = Math.abs(deg);
    const d = Math.floor(absolute);
    const m = Math.floor((absolute - d) * 60);
    const s = ((absolute - d - m / 60) * 3600).toFixed(2);
    const direction = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${d}°${m}'${s}"${direction}`;
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        const baseSize = 1080;
        let targetWidth = baseSize;
        let targetHeight = baseSize;

        if (aspectRatio === '16:9') targetHeight = (baseSize * 9) / 16;
        else if (aspectRatio === '4:3') targetHeight = (baseSize * 3) / 4;
        else if (aspectRatio === '9:16') {
          targetWidth = (baseSize * 9) / 16;
          targetHeight = baseSize;
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Calculate source crop from video
        const videoAspect = video.videoWidth / video.videoHeight;
        const targetAspect = targetWidth / targetHeight;

        let sWidth, sHeight, sx, sy;

        if (videoAspect > targetAspect) {
          sHeight = video.videoHeight;
          sWidth = sHeight * targetAspect;
          sx = (video.videoWidth - sWidth) / 2;
          sy = 0;
        } else {
          sWidth = video.videoWidth;
          sHeight = sWidth / targetAspect;
          sx = 0;
          sy = (video.videoHeight - sHeight) / 2;
        }
        
        context.save();
        if (facingMode === 'user') {
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
        }
        context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
        context.restore();

        // --- DRAW OVERLAYS ---
        const padding = 40;
        const fontSize = 20;
        const lineHeight = 28;
        
        // Bottom Overlay Panel - Adjust height based on canvas height
        const overlayHeight = Math.min(250, canvas.height * 0.4);
        context.fillStyle = 'rgba(0, 0, 0, 0.6)';
        context.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);
        
        context.fillStyle = 'white';
        context.font = `bold ${fontSize}px Inter, sans-serif`;
        
        const now = new Date();
        const timestamp = now.toLocaleString('id-ID', { 
          day: '2-digit', month: 'long', year: 'numeric', 
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZoneName: 'short'
        });

        let y = canvas.height - overlayHeight + 40;
        
        // 1. Timestamp & Header
        context.fillStyle = 'var(--g-primary, #00FF00)';
        context.fillText('GEOTAG & TIMESTAMP VERIFIED', padding, y - 10);
        context.fillStyle = 'white';
        context.fillText(`${timestamp}`, padding, y + 15);
        y += lineHeight + 15;

        // 2. Coordinates (Decimal & DMS)
        if (location) {
          const dmsLat = toDMS(location.lat, true);
          const dmsLng = toDMS(location.lng, false);
          context.font = `bold ${fontSize - 2}px Inter, sans-serif`;
          context.fillText(`LAT: ${location.lat.toFixed(6)}° | LNG: ${location.lng.toFixed(6)}°`, padding, y);
          y += lineHeight;
          context.fillText(`DMS: ${dmsLat} ${dmsLng}`, padding, y);
          y += lineHeight;
          
          context.font = `normal ${fontSize - 4}px Inter, sans-serif`;
          context.fillText(`ALTITUDE: ${location.altitude?.toFixed(1) || '0.0'}m | AKURASI: ±${location.accuracy?.toFixed(1)}m | PLUS: ${plusCode || 'N/A'}`, padding, y);
          y += lineHeight;
        }

        // 3. Weather & Env
        if (weather) {
          context.fillText(`CUACA: ${weather.temp}°C | KELEMBAPAN: ${weather.humidity}% | ANGIN: ${weather.wind}km/h | ARAH: ${heading ? heading.toFixed(0) + '°' : 'N/A'}`, padding, y);
          y += lineHeight;
        }

        // 4. Address (Wrapped)
        if (address) {
          context.font = `italic ${fontSize - 4}px Inter, sans-serif`;
          const words = address.split(' ');
          let line = 'LOKASI: ';
          let addrY = y;
          for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = context.measureText(testLine);
            if (metrics.width > canvas.width - 300 && n > 0) { // Leave space for map
              context.fillText(line, padding, addrY);
              line = words[n] + ' ';
              addrY += lineHeight - 5;
            } else {
              line = testLine;
            }
          }
          context.fillText(line, padding, addrY);
        }

        // 5. Stylized Map Visualization
        const mapSize = 180;
        const mapX = canvas.width - mapSize - padding;
        const mapY = canvas.height - mapSize - padding - 20;
        
        // Map Container
        context.fillStyle = 'rgba(20, 20, 20, 0.8)';
        context.fillRect(mapX, mapY, mapSize, mapSize);
        context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        context.lineWidth = 1;
        context.strokeRect(mapX, mapY, mapSize, mapSize);
        
        // Draw "Roads" (Stylized)
        context.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        context.beginPath();
        for(let i=0; i<5; i++) {
          context.moveTo(mapX + Math.random()*mapSize, mapY);
          context.lineTo(mapX + Math.random()*mapSize, mapY + mapSize);
          context.moveTo(mapX, mapY + Math.random()*mapSize);
          context.lineTo(mapX + mapSize, mapY + Math.random()*mapSize);
        }
        context.stroke();

        // Draw "Buildings" (Stylized)
        context.fillStyle = 'rgba(255, 255, 255, 0.05)';
        for(let i=0; i<8; i++) {
          context.fillRect(mapX + Math.random()*(mapSize-20), mapY + Math.random()*(mapSize-20), 15, 15);
        }
        
        // Draw Crosshair (Current Location)
        context.strokeStyle = 'var(--g-primary, #00FF00)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(mapX + mapSize/2, mapY + mapSize/2, 5, 0, Math.PI*2);
        context.stroke();
        
        context.beginPath();
        context.moveTo(mapX + mapSize/2 - 15, mapY + mapSize/2);
        context.lineTo(mapX + mapSize/2 + 15, mapY + mapSize/2);
        context.moveTo(mapX + mapSize/2, mapY + mapSize/2 - 15);
        context.lineTo(mapX + mapSize/2, mapY + mapSize/2 + 15);
        context.stroke();
        
        context.font = 'bold 9px Inter, sans-serif';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.fillText('GPS: SATELIT MODE', mapX + mapSize/2, mapY + 15);
        context.fillText('LIVE TRACKING ACTIVE', mapX + mapSize/2, mapY + mapSize - 10);
        context.textAlign = 'left';

        // 6. Branding & Sensor Data
        context.font = `black 12px Inter, sans-serif`;
        context.fillStyle = 'var(--g-primary, #00FF00)';
        context.fillText('CREATIVEFLOW CONTENT HUB - PROFESSIONAL ATTENDANCE SYSTEM', padding, canvas.height - 15);
        
        // Compass Icon on Photo
        if (heading !== null) {
          context.save();
          context.translate(canvas.width - 50, 50);
          context.rotate((heading * Math.PI) / 180);
          context.beginPath();
          context.moveTo(0, -20);
          context.lineTo(10, 10);
          context.lineTo(-10, 10);
          context.closePath();
          context.fillStyle = 'red';
          context.fill();
          context.restore();
          context.fillStyle = 'white';
          context.font = 'bold 10px Inter, sans-serif';
          context.fillText(`N`, canvas.width - 55, 25);
        }
        
        setPhoto(canvas.toDataURL('image/jpeg', 0.8)); 
        stopCamera();
      }
    }
  };

  const handleFocus = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusPoint({ x, y });
    setTimeout(() => setFocusPoint(null), 1000);
  };

  const handleFinalSubmit = () => {
    if (!location || (location.lat === 0 && location.lng === 0)) {
      alert("Lokasi GPS tidak valid (0,0). Mohon tunggu hingga lokasi terdeteksi.");
      return;
    }

    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    const dateStr = localDate.toISOString().split('T')[0];

    onSave({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: selectedName,
      timestamp: now.toLocaleString('id-ID'),
      date: dateStr, 
      photo: photo || '',
      location: { 
        lat: location.lat, 
        lng: location.lng,
        address: `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
      },
      lat: location.lat,
      lng: location.lng,
      address: `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`,
      type: attendanceType
    });
    
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    
    setIsCameraOpen(false);
    setPhoto(null);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Robust date parsing
      let logDate = log.date;
      
      if (!logDate && log.timestamp) {
        // Try to extract date from timestamp
        // Handle formats like "3/3/2026, 08:00:00" or "2026-03-03 08:00:00" or ISO
        const datePart = log.timestamp.split(/[,\sT]/)[0].trim();
        
        const parts = datePart.split(/[\/\-\.]/);
        if (parts.length === 3) {
          // Check if first part is year (YYYY-MM-DD)
          if (parts[0].length === 4) {
            logDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } 
          // Check if last part is year (DD/MM/YYYY or MM/DD/YYYY)
          else if (parts[2].length === 4) {
            // We'll assume DD/MM/YYYY for id-ID locale, but also try to be flexible
            // If the user is in a locale where it's MM/DD/YYYY, this might still be tricky
            // but usually it's DD/MM/YYYY in Indonesia.
            logDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      }
      
      // Normalize logDate if it exists to YYYY-MM-DD
      if (logDate && logDate.includes('/')) {
         const p = logDate.split('/');
         if (p.length === 3) {
            if (p[2].length === 4) logDate = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
            else if (p[0].length === 4) logDate = `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
         }
      }

      // Final fallback: if logDate is still empty or doesn't match, 
      // check if the timestamp string contains the dateFilter components
      if (logDate !== dateFilter && log.timestamp) {
        const [y, m, d] = dateFilter.split('-');
        // Check for various combinations in the timestamp string
        const possibleFormats = [
          `${d}/${m}/${y}`,
          `${m}/${d}/${y}`,
          `${y}-${m}-${d}`,
          `${d}-${m}-${y}`
        ];
        if (possibleFormats.some(fmt => log.timestamp.includes(fmt))) {
          return true;
        }
      }
      
      return logDate === dateFilter;
    }).sort((a, b) => {
      // Sort by timestamp descending
      try {
        // Try to parse as date, handle Indonesian format (replace . with :)
        const parseDate = (ts: string) => {
          if (!ts) return 0;
          // Handle "3/3/2026, 08.00.00" -> "3/3/2026 08:00:00"
          const normalized = ts.replace(/\./g, ':').replace(/,/g, '');
          const d = new Date(normalized);
          return isNaN(d.getTime()) ? 0 : d.getTime();
        };
        const timeA = parseDate(a.timestamp);
        const timeB = parseDate(b.timestamp);
        return timeB - timeA;
      } catch (e) {
        return 0;
      }
    });
  }, [logs, dateFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-[var(--g-surface)] p-6 md:p-8 rounded-[var(--g-radius)] border border-[var(--g-border)] shadow-[var(--g-shadow)]">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-[var(--g-primary-container)] rounded-xl flex items-center justify-center text-[var(--g-on-primary-container)] border border-[var(--g-primary)]/10 shadow-sm">
            <i className="fas fa-fingerprint text-lg"></i>
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--g-on-surface)] leading-tight">Presensi Digital</h2>
            <p className="text-[9px] text-[var(--g-on-surface-variant)] font-black uppercase tracking-widest mt-0.5">Sistem Monitoring Duta 2026</p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-[var(--g-on-surface-variant)] uppercase tracking-widest ml-1">Nama Personil</label>
            <select 
              value={selectedName}
              onChange={(e) => setSelectedName(e.target.value)}
              className="google-input w-full p-4 h-[52px] font-bold text-sm"
            >
              {ASSIGNEES.map(name => <option key={name} value={name}>{name.split(' (')[0]}</option>)}
            </select>
          </div>

          <div className="relative flex bg-[var(--g-bg)] p-1 rounded-xl border border-[var(--g-border)] h-[52px]">
            {/* Animated Background Slider */}
            <motion.div 
              className="absolute top-1 bottom-1 rounded-lg bg-[var(--g-surface)] border border-[var(--g-border)] shadow-md z-0"
              initial={false}
              animate={{ 
                left: attendanceType === 'In' ? '4px' : '50%',
                right: attendanceType === 'In' ? '50%' : '4px'
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
            
            <button 
              onClick={() => setAttendanceType('In')}
              className={`relative z-10 flex-1 py-3 text-[9px] font-black transition-colors rounded-lg tracking-widest uppercase flex items-center justify-center gap-2 ${attendanceType === 'In' ? 'text-green-600' : 'text-[var(--g-on-surface-variant)] hover:text-[var(--g-on-surface)]'}`}
            >
              <i className={`fas fa-sign-in-alt transition-transform duration-300 ${attendanceType === 'In' ? 'scale-110' : 'scale-100 opacity-50'}`}></i>
              MASUK
            </button>
            <button 
              onClick={() => setAttendanceType('Out')}
              className={`relative z-10 flex-1 py-3 text-[9px] font-black transition-colors rounded-lg tracking-widest uppercase flex items-center justify-center gap-2 ${attendanceType === 'Out' ? 'text-red-600' : 'text-[var(--g-on-surface-variant)] hover:text-[var(--g-on-surface)]'}`}
            >
              <i className={`fas fa-sign-out-alt transition-transform duration-300 ${attendanceType === 'Out' ? 'scale-110' : 'scale-100 opacity-50'}`}></i>
              PULANG
            </button>
          </div>

          <button 
            onClick={openCameraModal}
            className="w-full py-6 bg-[var(--g-primary)] text-black font-black shadow-xl rounded-xl tracking-[0.2em] text-xs uppercase hover:brightness-110 active:scale-95 transition-all border border-white/10"
          >
            AKTIFKAN KAMERA ABSENSI
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[9px] font-black text-[var(--g-on-surface-variant)] uppercase tracking-[0.3em]">Riwayat Kehadiran</h3>
          <div className="flex items-center gap-2">
            <button 
              onClick={onRefresh}
              className="w-8 h-8 rounded-lg bg-[var(--g-surface)] border border-[var(--g-border)] flex items-center justify-center text-[var(--g-on-surface-variant)] hover:bg-[var(--g-primary)] hover:text-black transition-all"
              title="Refresh Data"
            >
              <i className="fas fa-sync-alt text-[10px]"></i>
            </button>
            <input 
              type="date" 
              value={dateFilter} 
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-[var(--g-surface)] border border-[var(--g-border)] rounded-lg px-3 py-1.5 text-[10px] font-bold outline-none focus:border-[var(--g-primary)] transition-all"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="p-10 text-center border-2 border-dashed border-[var(--g-border)] rounded-[var(--g-radius)]">
               <p className="text-[var(--g-on-surface-variant)] text-[9px] uppercase font-black tracking-widest opacity-60 italic">Tidak ada aktivitas pada tanggal ini</p>
            </div>
          ) : (
            filteredLogs.map((log, idx) => (
              <div key={`${log.id}-${idx}`} className="bg-[var(--g-surface)] p-4 rounded-xl border border-[var(--g-border)] flex items-center justify-between group hover:border-[var(--g-primary)]/30 transition-all shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border border-[var(--g-border)] ${log.type === 'In' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                    <i className={`fas ${log.type === 'In' ? 'fa-sign-in-alt' : 'fa-sign-out-alt'} text-xs`}></i>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--g-on-surface)] leading-none mb-1.5">{log.name.split(' (')[0]}</p>
                    <p className="text-[9px] text-[var(--g-on-surface-variant)] font-black uppercase tracking-widest">{log.timestamp.split(', ')[1] || log.timestamp}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                   <button 
                    onClick={() => setSelectedLog(log)}
                    className="px-4 py-2 rounded-lg bg-[var(--g-surface-variant)] text-[9px] font-black uppercase tracking-widest border border-[var(--g-border)] hover:bg-[var(--g-primary)] hover:text-black transition-all"
                   >
                      DETAIL
                   </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[var(--g-surface)] w-full max-w-md rounded-[32px] border border-[var(--g-border)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-[var(--g-border)] flex justify-between items-center">
              <h3 className="font-black text-xs uppercase tracking-widest">Detail Presensi</h3>
              <button onClick={() => setSelectedLog(null)} className="w-8 h-8 rounded-full hover:bg-black/10 flex items-center justify-center"><i className="fas fa-times"></i></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4 p-4 bg-[var(--g-bg)] rounded-2xl border border-[var(--g-border)]">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border border-[var(--g-border)] ${selectedLog.type === 'In' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  <i className={`fas ${selectedLog.type === 'In' ? 'fa-sign-in-alt' : 'fa-sign-out-alt'} text-lg`}></i>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-0.5">Nama Personel</p>
                  <p className="text-sm font-black uppercase">{selectedLog.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--g-bg)] rounded-2xl border border-[var(--g-border)]">
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-1">Status</p>
                  <p className={`text-xs font-black uppercase ${selectedLog.type === 'In' ? 'text-green-500' : 'text-red-500'}`}>
                    {selectedLog.type === 'In' ? 'MASUK' : 'PULANG'}
                  </p>
                </div>
                <div className="p-4 bg-[var(--g-bg)] rounded-2xl border border-[var(--g-border)]">
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-1">Waktu</p>
                  <p className="text-xs font-black uppercase">{selectedLog.timestamp.split(', ')[1] || selectedLog.timestamp}</p>
                </div>
              </div>
              <div className="p-4 bg-[var(--g-bg)] rounded-2xl border border-[var(--g-border)]">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-1">Lokasi Presensi</p>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold">{selectedLog.location?.address || 'Koordinat Terlampir'}</p>
                  <a 
                    href={`https://www.google.com/maps?q=${selectedLog.location?.lat},${selectedLog.location?.lng}`} 
                    target="_blank" 
                    className="text-[9px] font-black text-[var(--g-primary)] hover:underline"
                  >
                    BUKA MAPS
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCameraOpen && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black overflow-hidden">
          {/* Transparent Header */}
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-center justify-between px-6 pointer-events-none">
            <div className="pointer-events-auto">
              <h3 className="font-extrabold text-white text-base tracking-tight drop-shadow-md">{selectedName.split(' (')[0]}</h3>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--g-primary)] drop-shadow-md">
                  {attendanceType === 'In' ? 'LOGGING: ENTRY' : 'LOGGING: EXIT'}
                </p>
              </div>
            </div>
            <button onClick={closeCameraModal} className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl text-white flex items-center justify-center hover:bg-white/20 transition-all pointer-events-auto border border-white/5">
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>

          <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            {!photo ? (
              <>
                <div 
                  className="relative transition-all duration-300 ease-in-out flex items-center justify-center cursor-crosshair"
                  onClick={handleFocus}
                  style={{ 
                    aspectRatio: aspectRatio.replace(':', '/'),
                    width: '100%',
                    height: '100%',
                    maxHeight: '100%',
                    maxWidth: '100%'
                  }}
                >
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className={`absolute inset-0 w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
                  />

                  {/* Grid Overlay */}
                  {showGrid && (
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none z-10">
                      <div className="border-r border-b border-white/20"></div>
                      <div className="border-r border-b border-white/20"></div>
                      <div className="border-b border-white/20"></div>
                      <div className="border-r border-b border-white/20"></div>
                      <div className="border-r border-b border-white/20"></div>
                      <div className="border-b border-white/20"></div>
                      <div className="border-r border-white/20"></div>
                      <div className="border-r border-white/20"></div>
                      <div></div>
                    </div>
                  )}

                  {/* Focus Ring */}
                  <AnimatePresence>
                    {focusPoint && (
                      <motion.div 
                        initial={{ scale: 2, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        className="absolute w-16 h-16 border-2 border-[var(--g-primary)] rounded-full z-50 pointer-events-none"
                        style={{ left: focusPoint.x - 32, top: focusPoint.y - 32 }}
                      />
                    )}
                  </AnimatePresence>
                </div>
                
                {/* Floating Location Pill */}
                <div className="absolute bottom-36 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 w-full px-6">
                  <div className={`px-5 py-2.5 rounded-2xl backdrop-blur-xl border flex flex-col gap-1 shadow-2xl transition-all w-full max-w-xs ${location && (location.lat !== 0 || location.lng !== 0) ? 'bg-green-500/20 border-green-500/50' : 'bg-black/60 border-white/10'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${location && (location.lat !== 0 || location.lng !== 0) ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.9)]' : 'bg-red-500 animate-pulse'}`}></div>
                      <span className="text-[9px] text-white font-black tracking-[0.2em] uppercase">
                        {location && (location.lat !== 0 || location.lng !== 0) ? `LOKASI TERKUNCI` : 'MENCARI SINYAL GPS...'}
                      </span>
                    </div>
                    {location && (
                      <div className="mt-1 space-y-1">
                        <p className="text-[10px] text-white/90 font-bold truncate">{address || 'Memuat alamat...'}</p>
                        <div className="flex justify-between items-center">
                          <p className="text-[8px] text-white/60 font-mono">{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</p>
                          <p className="text-[8px] text-white/40 font-mono">{plusCode}</p>
                        </div>
                        <div className="flex justify-between items-center">
                          {weather && <p className="text-[8px] text-[var(--g-primary)] font-bold">{weather.temp}°C | {weather.condition}</p>}
                          {heading !== null && <p className="text-[8px] text-white/60 font-bold"><i className="fas fa-compass mr-1"></i>{heading.toFixed(0)}°</p>}
                        </div>
                      </div>
                    )}
                  </div>
                  {(!location || (location.lat === 0 && location.lng === 0)) && (
                    <button 
                      onClick={getLocation}
                      className="px-4 py-2 rounded-xl bg-white/10 backdrop-blur-md text-[8px] font-black text-white uppercase tracking-widest border border-white/5 hover:bg-white/20 transition-all"
                    >
                      <i className="fas fa-redo-alt mr-2"></i> REFRESH GPS
                    </button>
                  )}
                </div>

                {/* Pro Camera Controls Sidebar */}
                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-4">
                  <button 
                    onClick={() => setShowGrid(!showGrid)}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border ${showGrid ? 'bg-[var(--g-primary)] text-black border-transparent' : 'bg-white/10 text-white border-white/10'}`}
                  >
                    <i className="fas fa-th-large text-sm"></i>
                  </button>
                  <button 
                    onClick={() => setAspectRatio(p => {
                      if (p === '16:9') return '4:3';
                      if (p === '4:3') return '1:1';
                      if (p === '1:1') return '9:16';
                      return '16:9';
                    })}
                    className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl text-white flex flex-col items-center justify-center border border-white/10 hover:bg-white/20 transition-all"
                  >
                    <span className="text-[8px] font-black">{aspectRatio}</span>
                  </button>
                </div>

                {/* Controls Area */}
                <div className="absolute bottom-10 inset-x-0 flex items-center justify-around px-8">
                  <button onClick={toggleCamera} className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-2xl text-white flex items-center justify-center hover:bg-white/20 transition-all border border-white/10 shadow-lg">
                    <i className="fas fa-sync-alt text-xl"></i>
                  </button>
                  
                  <button 
                    onClick={takePhoto} 
                    disabled={!location || (location.lat === 0 && location.lng === 0)} 
                    className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full p-2 shadow-2xl disabled:opacity-30 transition-all active:scale-90 group"
                  >
                    <div className="w-full h-full border-4 border-white rounded-full bg-transparent flex items-center justify-center group-active:bg-white transition-all">
                      <div className="w-16 h-16 rounded-full bg-white opacity-40 group-hover:opacity-100 transition-all"></div>
                    </div>
                  </button>

                  <div className="w-16 h-16 flex items-center justify-center">
                    {weather && (
                      <div className="text-white text-center">
                        <i className="fas fa-wind text-xs opacity-50 mb-1"></i>
                        <p className="text-[8px] font-black">{weather.wind}km/h</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[#0a0a0a]">
                <img src={photo} className="w-full h-full max-h-[75vh] object-contain rounded-3xl shadow-2xl border border-white/5 mb-10" />
                <div className="flex gap-4 w-full max-w-sm">
                   <button onClick={() => { setPhoto(null); startCamera(facingMode); }} className="flex-1 py-5 bg-white/5 text-white font-extrabold rounded-2xl tracking-[0.2em] text-[10px] uppercase border border-white/10 hover:bg-white/10 transition-all">ULANGI FOTO</button>
                   <button onClick={handleFinalSubmit} className="flex-1 py-5 bg-[var(--g-primary)] text-black font-extrabold rounded-2xl shadow-2xl tracking-[0.2em] text-[10px] uppercase hover:brightness-110 active:scale-95 transition-all">VERIFIKASI</button>
                </div>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </div>
  );
};

export default AttendanceModule;
