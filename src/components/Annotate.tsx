import { useEffect, useMemo, useRef, useState } from 'react';

// Types
type EventItem = { description: string; start_time: string; end_time: string; event: string };
type ClipInfo = { name: string; hasAnnotation: boolean };

type DirEntry = [string, FileSystemFileHandle | FileSystemDirectoryHandle];

type ShowDirectoryPicker = () => Promise<FileSystemDirectoryHandle>;

// File System Access helpers
async function getSubdirHandle(root: FileSystemDirectoryHandle, name: string, create = false) {
	for await (const [key, handle] of (root as unknown as AsyncIterable<DirEntry>)) {
		if ((handle as FileSystemDirectoryHandle).kind === 'directory' && key === name) return handle as FileSystemDirectoryHandle;
	}
	return create ? await root.getDirectoryHandle(name, { create: true }) : undefined;
}

async function existsFile(dir: FileSystemDirectoryHandle, fileName: string) {
	try {
		await dir.getFileHandle(fileName);
		return true;
	} catch {
		return false;
	}
}

function secondsToMMSS(sec: number) {
	const s = Math.max(0, Math.floor(sec));
	const mm = String(Math.floor(s / 60)).padStart(2, '0');
	const ss = String(s % 60).padStart(2, '0');
	return `${mm}:${ss}`;
}

export default function Annotate() {
	const [trainHandle, setTrainHandle] = useState<FileSystemDirectoryHandle | null>(null);
	const [clipsHandle, setClipsHandle] = useState<FileSystemDirectoryHandle | null>(null);
	const [annHandle, setAnnHandle] = useState<FileSystemDirectoryHandle | null>(null);
	const [classes, setClasses] = useState<string[]>([]);
	const [currentClass, setCurrentClass] = useState<string>("");
	const [clips, setClips] = useState<ClipInfo[]>([]);
	const [selected, setSelected] = useState<string>("");
	const [videoUrl, setVideoUrl] = useState<string>("");
	const [events, setEvents] = useState<EventItem[]>([]);
	const [filterMissing, setFilterMissing] = useState(false);
	const [markIn, setMarkIn] = useState<number | null>(null);
	const [markOut, setMarkOut] = useState<number | null>(null);
	const [playing, setPlaying] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);
	const prevUrl = useRef<string>("");

	const AVAILABLE_EVENTS: string[] = useMemo(() => (
		[
			'Goal',
			'Goal Line Event',
			'Woodworks',
			'Shot on Target',
			'Red Card',
			'Yellow Card',
			'Penalty Shot',
			'Hat Trick'
		]
	), []);

	useEffect(() => {
		return () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current); };
	}, []);

	const filteredClips = useMemo(() => filterMissing ? clips.filter(c => !c.hasAnnotation) : clips, [clips, filterMissing]);

	async function connectFolder() {
		try {
			if (!('showDirectoryPicker' in window)) throw new Error('This browser does not support directory access. Use Chrome or Edge.');
			const picker = (window as unknown as { showDirectoryPicker: ShowDirectoryPicker }).showDirectoryPicker;
			const root = await picker();
			const one = await getSubdirHandle(root, '01_clips');
			const two = await getSubdirHandle(root, '02_annotations', true);
			if (!one || !two) throw new Error('Invalid folder: must contain 01_clips and 02_annotations');
			setTrainHandle(root);
			setClipsHandle(one);
			setAnnHandle(two);
			// Load classes
			const cls: string[] = [];
			for await (const [key, handle] of (one as unknown as AsyncIterable<DirEntry>)) {
				if ((handle as FileSystemDirectoryHandle).kind === 'directory') cls.push(key);
			}
			cls.sort();
			setClasses(cls);
			if (cls.length) setCurrentClass(cls[0]);
		} catch (e) {
			console.error(e);
		}
	}

	useEffect(() => {
		if (!clipsHandle || !annHandle || !currentClass) return;
		(async () => {
			try {
				const classClips = await clipsHandle.getDirectoryHandle(currentClass);
				const classAnno = await annHandle.getDirectoryHandle(currentClass, { create: true });
				const items: ClipInfo[] = [];
				for await (const [key, handle] of (classClips as unknown as AsyncIterable<DirEntry>)) {
					if ((handle as FileSystemFileHandle).kind === 'file' && key.toLowerCase().endsWith('.mp4')) {
						const name = key.replace(/\.mp4$/i, '');
						items.push({ name, hasAnnotation: await existsFile(classAnno, `${name}.json`) });
					}
				}
				items.sort();
				setClips(items);
				setSelected("");
				setEvents([]);
				if (prevUrl.current) { URL.revokeObjectURL(prevUrl.current); prevUrl.current = ""; setVideoUrl(""); }
			} catch (e) {
				console.error(e);
			}
		})();
	}, [clipsHandle, annHandle, currentClass]);

	async function loadClip(name: string) {
		if (!clipsHandle || !annHandle || !currentClass) return;
		setSelected(name);
		// video
		const classClips = await clipsHandle.getDirectoryHandle(currentClass);
		const fileHandle = await classClips.getFileHandle(`${name}.mp4`);
		const file = await fileHandle.getFile();
		const url = URL.createObjectURL(file);
		if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
		prevUrl.current = url;
		setVideoUrl(url);
		// json
		try {
			const classAnno = await annHandle.getDirectoryHandle(currentClass, { create: true });
			const annoHandle = await classAnno.getFileHandle(`${name}.json`);
			const annoFile = await annoHandle.getFile();
			const text = await annoFile.text();
			const data = JSON.parse(text);
			setEvents(Array.isArray(data) ? data as EventItem[] : []);
		} catch {
			setEvents([]);
		}
	}

	function addQuickEvent(eventName: string) {
		if (!videoRef.current) return;
		videoRef.current.pause();
		setPlaying(false);
		const now = secondsToMMSS(videoRef.current.currentTime || 0);
		setEvents(prev => [...prev, { description: '', event: eventName, start_time: now, end_time: now }]);
	}

	function updateEvent(index: number, patch: Partial<EventItem>) {
		setEvents(prev => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
	}

	function removeEvent(index: number) {
		setEvents(prev => prev.filter((_, i) => i !== index));
	}

	async function save() {
		if (!annHandle || !currentClass || !selected) return;
		const valid = events.every(e => e.description && e.event && e.start_time && e.end_time);
		if (!valid) return;
		const classAnno = await annHandle.getDirectoryHandle(currentClass, { create: true });
		const fileHandle = await classAnno.getFileHandle(`${selected}.json`, { create: true });
		const writable = await (fileHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
		await writable.write(new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }));
		await writable.close();
		// refresh clip list to mark annotated
		setClips(prev => prev.map(c => c.name === selected ? { ...c, hasAnnotation: true } : c));
	}

	return (
		<div className="max-w-[1600px] mx-auto p-6">
			{/* Connect Folder */}
			<div className="bg-[#121212] border-2 border-transparent rounded-lg shadow-lg p-4 mb-6 relative group hover:border-[#76B900] transition-all duration-300">
				<div className="relative z-10 flex items-center gap-3">
					<button onClick={connectFolder} className="px-4 py-2 bg-[#76B900] text-black rounded-md hover:bg-[#87ca00] transition">{trainHandle ? 'Reconnect Folder' : 'Connect Train Folder'}</button>
					<div className="text-sm text-gray-400">Grant access to the root that contains 01_clips and 02_annotations</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">
				{/* Sidebar */}
				<aside className="bg-[#121212] rounded-lg p-4 border-2 border-transparent hover:border-[#76B900] transition-all">
					<h3 className="text-[#76B900] font-semibold mb-3">Classes</h3>
					<select disabled={!classes.length} value={currentClass} onChange={e => setCurrentClass(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm mb-3">
						{classes.map(c => <option key={c} value={c}>{c}</option>)}
					</select>
					<label className="flex items-center gap-2 text-sm text-gray-300 mb-3">
						<input type="checkbox" checked={filterMissing} onChange={e => setFilterMissing(e.target.checked)} /> Show only missing
					</label>
					<div className="text-xs text-gray-400 mb-2">{clips.filter(c => c.hasAnnotation).length} / {clips.length} annotated</div>
					<div className="flex flex-col gap-2">
						{filteredClips.map(c => (
							<button key={c.name} onClick={() => loadClip(c.name)} className={`text-left px-3 py-2 rounded border ${selected === c.name ? 'bg-[#0f1b0a] border-[#76B900]' : 'bg-[#1a1a1a] border-gray-700'} hover:border-[#76B900] transition`}>{c.name}{c.hasAnnotation ? ' ✅' : ''}</button>
						))}
					</div>
				</aside>

				{/* Main */}
				<section className="space-y-4">
					<div className="bg-[#121212] rounded-lg p-4 border-2 border-transparent hover:border-[#76B900] transition">
						<div className="flex items-center gap-3">
							<div>Class: <b>{currentClass || '-'}</b></div>
							<div>Clip: <b>{selected || '-'}</b></div>
							<button onClick={save} disabled={!selected || events.length === 0} className="ml-auto px-3 py-2 bg-[#76B900] text-black rounded-md disabled:opacity-50">Save (S)</button>
						</div>
					</div>

					<div className="bg-[#121212] rounded-lg p-4 border-2 border-transparent hover:border-[#76B900] transition">
						{videoUrl ? (
							<video ref={videoRef} controls src={videoUrl} className="w-full h-[360px] bg-black rounded" />
						) : (
							<div className="h-[360px] border border-dashed border-gray-700 rounded grid place-items-center text-gray-500">Select a clip</div>
						)}
						<div className="flex gap-2 mt-3 text-sm">
							<button onClick={() => { if (!videoRef.current) return; if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true); } else { videoRef.current.pause(); setPlaying(false); } }} className="px-3 py-1 bg-[#1a1a1a] border border-gray-700 rounded">{playing ? 'Pause' : 'Play'}</button>
						</div>
					</div>

					<div className="bg-[#121212] rounded-lg p-4 border-2 border-transparent hover:border-[#76B900] transition">
						<h3 className="text-[#76B900] font-semibold mb-3">Quick Event Cards</h3>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
							{AVAILABLE_EVENTS.map(ev => (
								<button
									key={ev}
									onClick={() => addQuickEvent(ev)}
									className="text-left bg-[#1a1a1a] border border-gray-700 rounded-lg p-3 hover:border-[#76B900] hover:shadow-[0_0_12px_rgba(118,185,0,0.2)] transition"
								>
									<div className="text-sm font-medium text-gray-200">{ev}</div>
									<div className="text-xs text-gray-400">Add at current time</div>
								</button>
							))}
						</div>
					</div>

					<div className="bg-[#121212] rounded-lg p-4 border-2 border-transparent hover:border-[#76B900] transition">
						<h3 className="text-[#76B900] font-semibold mb-3">Events</h3>
						{events.length === 0 && <div className="text-gray-400 text-sm">No events yet.</div>}
						<div className="grid gap-2">
							{events.map((ev, i) => (
								<div key={i} className="grid grid-cols-1 md:grid-cols-[160px,160px,1fr,auto] gap-2 items-center">
									<input value={ev.event} placeholder="Event (Goal, Foul, Yellow Card)" onChange={e => updateEvent(i, { event: e.target.value })} className="bg-[#1a1a1a] border border-gray-700 rounded px-2 py-1 text-sm" />
									<input value={ev.start_time} placeholder="mm:ss" onChange={e => updateEvent(i, { start_time: e.target.value })} className="bg-[#1a1a1a] border border-gray-700 rounded px-2 py-1 text-sm" />
									<input value={ev.end_time} placeholder="mm:ss" onChange={e => updateEvent(i, { end_time: e.target.value })} className="bg-[#1a1a1a] border border-gray-700 rounded px-2 py-1 text-sm" />
									<input value={ev.description} placeholder="Description" onChange={e => updateEvent(i, { description: e.target.value })} className="bg-[#1a1a1a] border border-gray-700 rounded px-2 py-1 text-sm" />
									<button onClick={() => removeEvent(i)} className="px-3 py-1 bg-[#1a1a1a] border border-gray-700 rounded text-red-300">Delete</button>
								</div>
							))}
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
