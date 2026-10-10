import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  User, Shield, Award, Settings, LogOut, Eye, EyeOff, Volume2, 
  Sparkles, CheckCircle, HelpCircle, Palette, Lock, Sun, Moon, 
  Type, FolderOpen, ExternalLink, RefreshCw, Key, Copy, Check, 
  ShieldCheck, Mail, Phone, GraduationCap, Users,
  Gamepad2, Play, RotateCw, ArrowLeft, ArrowRight, ArrowDown, ChevronsDown, Trophy
} from "lucide-react";
import { TeamMember, UserRole, normalizeEmail, ProbiTrackerState, DEFAULT_PROBI_CONGRATS_MESSAGE } from "../types";
import { OFFICIAL_ACCOUNTS } from "./LoginPage";
import { OFFICIAL_MEMBERS_MAP, getOfficialFullName, getPreferredFirstName } from "../lib/memberUtils";
import { AccentTheme, ACCENT_OPTIONS } from "../lib/accentTheme";
import { toISOFormatDate } from "./AssignmentsList";

// Sortable timestamp for a Task Archive row, derived from the releaseDate label
// the card actually displays. Labels arrive as "OCTOBER 3, 2026", "2026-10-03"
// or a bare "OCTOBER 3"; issue-sheet rows instead hold a page number or
// "Issue Board", which have no date and return NaN so they sink to the bottom.
function archivedTaskDate(task: any): number {
  const raw = String(task.releaseDate || "").trim();
  if (!raw) return NaN;

  // A bare "OCTOBER 3" carries no year. Borrow it from lastUpdated rather than
  // assuming the current year, so a December task still outranks a January one
  // across a year boundary.
  const updated = new Date(String(task.lastUpdated || ""));
  const source = /\d{4}/.test(raw) || isNaN(updated.getTime())
    ? raw
    : `${raw} ${updated.getUTCFullYear()}`;

  const iso = toISOFormatDate(source);
  return iso ? Date.parse(iso) : NaN;
}

interface ProfileSettingsProps {
  currentUserRole: UserRole;
  currentUserName: string;
  currentUserEmail: string;
  members: TeamMember[];
  tasks?: any[];
  probiTracker?: ProbiTrackerState;
  onSubmitOpinionArticle?: (docLink: string) => void;
  speechEnabled: boolean;
  setSpeechEnabled: (v: boolean) => void;
  fontSizeMultiplier: number;
  setFontSizeMultiplier: (v: number) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
  darkMode?: boolean;
  setDarkMode?: (v: boolean) => void;
  accentTheme?: AccentTheme;
  setAccentTheme?: (v: AccentTheme) => void;
  dyslexicFont?: boolean;
  setDyslexicFont?: (v: boolean) => void;
  onLogout: () => void;
}

/* ------------------------------------------------------------------ */
/* MKule Tetris Break — a 3-round mini-game rendered at the page foot  */
/* ------------------------------------------------------------------ */

type TetrisStatus = "idle" | "playing" | "roundComplete" | "won" | "over";

interface TetrisPiece {
  shapeIdx: number;
  rot: number;
  x: number;
  y: number;
}

interface TetrisGameState {
  status: TetrisStatus;
  round: number;
  linesInRound: number;
  totalLines: number;
  score: number;
  board: string[][];
  piece: TetrisPiece | null;
  message: string;
}

const TETRIS_COLS = 10;
const TETRIS_ROWS = 16;
const TETRIS_TOTAL_ROUNDS = 3;
const TETRIS_LINES_PER_ROUND = 3;
const TETRIS_ROUND_SPEEDS = [820, 640, 480];

const TETROMINOES: { color: string; cells: number[][][] }[] = [
  { color: "bg-cyan-400", cells: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ] },
  { color: "bg-amber-400", cells: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ] },
  { color: "bg-purple-500", cells: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ] },
  { color: "bg-emerald-500", cells: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
  ] },
  { color: "bg-rose-500", cells: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
  ] },
  { color: "bg-blue-500", cells: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ] },
  { color: "bg-orange-500", cells: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ] },
];

function tetrisEmptyBoard(): string[][] {
  return Array.from({ length: TETRIS_ROWS }, () => Array(TETRIS_COLS).fill(""));
}

function tetrisRandomPiece(): TetrisPiece {
  return { shapeIdx: Math.floor(Math.random() * TETROMINOES.length), rot: 0, x: 3, y: 0 };
}

function tetrisCollides(board: string[][], piece: TetrisPiece): boolean {
  return TETROMINOES[piece.shapeIdx].cells[piece.rot].some(([cx, cy]) => {
    const bx = piece.x + cx;
    const by = piece.y + cy;
    if (bx < 0 || bx >= TETRIS_COLS || by >= TETRIS_ROWS) return true;
    return by >= 0 && board[by][bx] !== "";
  });
}

function tetrisIdleState(): TetrisGameState {
  return {
    status: "idle",
    round: 1,
    linesInRound: 0,
    totalLines: 0,
    score: 0,
    board: tetrisEmptyBoard(),
    piece: null,
    message: `${TETRIS_TOTAL_ROUNDS} rounds — clear ${TETRIS_LINES_PER_ROUND} lines each round to win.`,
  };
}

function tetrisNewGame(): TetrisGameState {
  return {
    status: "playing",
    round: 1,
    linesInRound: 0,
    totalLines: 0,
    score: 0,
    board: tetrisEmptyBoard(),
    piece: tetrisRandomPiece(),
    message: `Round 1 of ${TETRIS_TOTAL_ROUNDS} — clear ${TETRIS_LINES_PER_ROUND} lines!`,
  };
}

function tetrisNextRound(state: TetrisGameState): TetrisGameState {
  if (state.status !== "roundComplete") return state;
  return {
    ...state,
    status: "playing",
    round: state.round + 1,
    linesInRound: 0,
    board: tetrisEmptyBoard(),
    piece: tetrisRandomPiece(),
    message: `Round ${state.round + 1} of ${TETRIS_TOTAL_ROUNDS} — clear ${TETRIS_LINES_PER_ROUND} lines!`,
  };
}

function tetrisLockPiece(state: TetrisGameState): TetrisGameState {
  const piece = state.piece;
  if (!piece) return state;

  const color = TETROMINOES[piece.shapeIdx].color;
  const board = state.board.map(row => [...row]);
  TETROMINOES[piece.shapeIdx].cells[piece.rot].forEach(([cx, cy]) => {
    const bx = piece.x + cx;
    const by = piece.y + cy;
    if (by >= 0 && by < TETRIS_ROWS && bx >= 0 && bx < TETRIS_COLS) board[by][bx] = color;
  });

  const keptRows = board.filter(row => row.some(cell => cell === ""));
  const cleared = TETRIS_ROWS - keptRows.length;
  const nextBoard = [...Array.from({ length: cleared }, () => Array(TETRIS_COLS).fill("")), ...keptRows];

  const totalLines = state.totalLines + cleared;
  const linesInRound = state.linesInRound + cleared;
  const score = state.score + cleared * 100 * state.round;

  if (linesInRound >= TETRIS_LINES_PER_ROUND) {
    const finished = state.round >= TETRIS_TOTAL_ROUNDS;
    return {
      ...state,
      board: nextBoard,
      piece: null,
      totalLines,
      linesInRound,
      score,
      status: finished ? "won" : "roundComplete",
      message: finished
        ? `All ${TETRIS_TOTAL_ROUNDS} rounds cleared — final score ${score}!`
        : `Round ${state.round} of ${TETRIS_TOTAL_ROUNDS} complete! Ready for round ${state.round + 1}?`,
    };
  }

  const nextPiece = tetrisRandomPiece();
  if (tetrisCollides(nextBoard, nextPiece)) {
    return {
      ...state,
      board: nextBoard,
      piece: null,
      totalLines,
      linesInRound,
      score,
      status: "over",
      message: `Game over — the stack topped out in round ${state.round}.`,
    };
  }

  return {
    ...state,
    board: nextBoard,
    piece: nextPiece,
    totalLines,
    linesInRound,
    score,
    message: cleared > 0
      ? `Cleared ${cleared} line${cleared === 1 ? "" : "s"}! ${TETRIS_LINES_PER_ROUND - linesInRound} more to finish round ${state.round}.`
      : state.message,
  };
}

function tetrisStepDown(state: TetrisGameState): TetrisGameState {
  if (state.status !== "playing" || !state.piece) return state;
  const moved = { ...state.piece, y: state.piece.y + 1 };
  if (!tetrisCollides(state.board, moved)) return { ...state, piece: moved };
  return tetrisLockPiece(state);
}

function tetrisMoveHorizontal(state: TetrisGameState, dx: number): TetrisGameState {
  if (state.status !== "playing" || !state.piece) return state;
  const moved = { ...state.piece, x: state.piece.x + dx };
  return tetrisCollides(state.board, moved) ? state : { ...state, piece: moved };
}

function tetrisRotate(state: TetrisGameState): TetrisGameState {
  if (state.status !== "playing" || !state.piece) return state;
  const rot = (state.piece.rot + 1) % TETROMINOES[state.piece.shapeIdx].cells.length;
  for (const kick of [0, -1, 1, -2, 2]) {
    const candidate = { ...state.piece, rot, x: state.piece.x + kick };
    if (!tetrisCollides(state.board, candidate)) return { ...state, piece: candidate };
  }
  return state;
}

function tetrisHardDrop(state: TetrisGameState): TetrisGameState {
  if (state.status !== "playing" || !state.piece) return state;
  let y = state.piece.y;
  while (!tetrisCollides(state.board, { ...state.piece, y: y + 1 })) y += 1;
  const dropped = { ...state.piece, y };
  return tetrisLockPiece({ ...state, piece: dropped, score: state.score + 2 * (y - state.piece.y) });
}

export default function ProfileSettings({
  currentUserRole,
  currentUserName,
  currentUserEmail,
  members,
  tasks = [],
  probiTracker,
  onSubmitOpinionArticle,
  speechEnabled,
  setSpeechEnabled,
  fontSizeMultiplier,
  setFontSizeMultiplier,
  highContrast,
  setHighContrast,
  darkMode = false,
  setDarkMode,
  accentTheme = "maroon",
  setAccentTheme,
  dyslexicFont = false,
  setDyslexicFont,
  onLogout,
}: ProfileSettingsProps) {
  const [probiDocLink, setProbiDocLink] = useState("");
  // Find current user's full member object for details
  const officialAccount = OFFICIAL_ACCOUNTS.find(
    (a) =>
      a.email.toLowerCase() === currentUserEmail.toLowerCase() ||
      a.name.toLowerCase() === currentUserName.toLowerCase() ||
      (a.name.includes("Donor") && currentUserName.includes("Donor"))
  );

  const currentMember = members.find(m => m.email === currentUserEmail) || {
    xp: currentUserRole === "Layout Staff Member" ? 320 : 1200,
    level: currentUserRole === "Layout Staff Member" ? 3 : 10,
    college: officialAccount?.college || "CP",
    contact: officialAccount?.contact || "9054353693"
  };

  const userCollege = officialAccount?.college || currentMember.college || "CP";
  const userContact = officialAccount?.contact || currentMember.contact || "9054353693";
  const userPin = officialAccount?.pin || "••••••••";

  const [showPwdModal, setShowPwdModal] = useState(false);
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSectionRoster, setShowSectionRoster] = useState(false);
  const [statsMode, setStatsMode] = useState<"semester" | "month">("semester");
  const [selectedMonth, setSelectedMonth] = useState<string>("September");

  // Tetris mini-game state
  const [tetris, setTetris] = useState<TetrisGameState>(tetrisIdleState);
  const tetrisRef = useRef(tetris);

  useEffect(() => {
    tetrisRef.current = tetris;
  }, [tetris]);

  // Gravity tick — the drop speed ramps up each round
  useEffect(() => {
    if (tetris.status !== "playing") return;
    const speed = TETRIS_ROUND_SPEEDS[tetris.round - 1] || TETRIS_ROUND_SPEEDS[TETRIS_ROUND_SPEEDS.length - 1];
    const id = window.setInterval(() => setTetris(prev => tetrisStepDown(prev)), speed);
    return () => window.clearInterval(id);
  }, [tetris.status, tetris.round]);

  // Keyboard controls while the game is in focus on this page
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.tagName === "BUTTON" || target.isContentEditable)) return;
      const status = tetrisRef.current.status;
      if (status === "playing") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setTetris(prev => tetrisMoveHorizontal(prev, -1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setTetris(prev => tetrisMoveHorizontal(prev, 1));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setTetris(prev => tetrisStepDown(prev));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setTetris(prev => tetrisRotate(prev));
        } else if (e.key === " ") {
          e.preventDefault();
          setTetris(prev => tetrisHardDrop(prev));
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setTetris(prev => (prev.status === "roundComplete" ? tetrisNextRound(prev) : tetrisNewGame()));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Voice feedback for round flow (follows the shared speech toggle)
  useEffect(() => {
    if (tetris.status === "roundComplete") {
      speakText(`Round ${tetris.round} of ${TETRIS_TOTAL_ROUNDS} complete! Ready for the next round.`);
    } else if (tetris.status === "won") {
      speakText(`Congratulations! All ${TETRIS_TOTAL_ROUNDS} rounds cleared. Final score ${tetris.score}.`);
    } else if (tetris.status === "over") {
      speakText(`Game over in round ${tetris.round}. Press Enter to try again.`);
    }
  }, [tetris.status]);

  useEffect(() => {
    if (tetris.status === "playing" && tetris.totalLines > 0) speakText("Line cleared!");
  }, [tetris.totalLines]);

  const tetrisView = useMemo(() => {
    const grid = tetris.board.map(row => [...row]);
    if (tetris.status === "playing" && tetris.piece) {
      const { shapeIdx, rot, x, y } = tetris.piece;
      const color = TETROMINOES[shapeIdx].color;
      TETROMINOES[shapeIdx].cells[rot].forEach(([cx, cy]) => {
        const bx = x + cx;
        const by = y + cy;
        if (by >= 0 && by < TETRIS_ROWS && bx >= 0 && bx < TETRIS_COLS) grid[by][bx] = color;
      });
    }
    return grid;
  }, [tetris]);

  const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const memberTasks = tasks.filter((task: any) => {
    const memberNames = [
      getOfficialFullName(currentUserName, currentUserEmail),
      currentUserName,
      getPreferredFirstName(currentUserName, currentUserEmail),
      OFFICIAL_MEMBERS_MAP[currentUserEmail.toLowerCase()]?.officialName,
      OFFICIAL_MEMBERS_MAP[currentUserEmail.toLowerCase()]?.preferredFirstName,
      (currentUserName || "").split(",")[0],
      (currentUserName || "").split(" ")[0]
    ].filter(Boolean).map((value) => value.toLowerCase());

    const assigneeFit = (task.illusLayout || "").toLowerCase();
    const graphicsFit = (task.graphics || "").toLowerCase();
    const writerFit = (task.writer || "").toLowerCase();

    return memberNames.some((value) => assigneeFit.includes(value) || graphicsFit.includes(value) || writerFit.includes(value));
  });

  const completedWork = memberTasks.filter((task: any) => task.progress === "Completed" || task.progress === "Approved").length;
  const activeWork = memberTasks.filter((task: any) => task.progress !== "Completed" && task.progress !== "Approved" && task.progress !== "Archived" && task.progress !== "Shelved").length;
  const archivedTasks = memberTasks
    .filter((task: any) => task.progress === "Completed" || task.progress === "Approved")
    .sort((a: any, b: any) => {
      const dateA = archivedTaskDate(a);
      const dateB = archivedTaskDate(b);
      if (isNaN(dateA) || isNaN(dateB)) {
        return isNaN(dateA) === isNaN(dateB) ? 0 : isNaN(dateA) ? 1 : -1;
      }
      return dateB - dateA;
    });

  const monthCounts = monthOrder.map((month) => {
    const count = memberTasks.filter((task: any) => {
      const raw = String(task.releaseDate || "").toLowerCase();
      return raw.includes(month.toLowerCase()) || raw.includes(month.slice(0, 3).toLowerCase());
    }).length;
    return { month, count };
  });

  const peakMonth = monthCounts.reduce((top, current) => current.count > top.count ? current : top, monthCounts[0] || { month: "N/A", count: 0 });

  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
    speakText(`Copied ${label} to clipboard.`);
  };

  const speakText = (text: string) => {
    if (!speechEnabled) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  };

  // Probi Tracker — term requirements for graduation to layout staffer
  const isLayoutProbi = currentUserRole === "Layout Probi";
  const probiTaskDoneCount = memberTasks.filter(
    (task: any) =>
      (task.typeOfRelease === "Issue Article" || task.typeOfRelease === "Online Article") &&
      (task.progress === "Completed" || task.progress === "Approved")
  ).length;
  const myOpinionArticles = (probiTracker?.articles || []).filter(
    (a) => normalizeEmail(a.memberEmail).toLowerCase() === normalizeEmail(currentUserEmail).toLowerCase()
  );
  const probiOpinionDone = myOpinionArticles.filter((a) => a.status === "Done").length;
  const probiGraduated = probiTaskDoneCount >= 8 && probiOpinionDone >= 1;

  useEffect(() => {
    if (isLayoutProbi && probiGraduated) {
      speakText(probiTracker?.congratsMessage || DEFAULT_PROBI_CONGRATS_MESSAGE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probiGraduated]);

  const handleAccentChange = (color: AccentTheme) => {
    if (setAccentTheme) {
      setAccentTheme(color);
    }
    speakText(`Accent theme adjusted to ${color}`);
  };

  const handleResetDefaults = () => {
    if (setDarkMode) setDarkMode(false);
    if (setAccentTheme) setAccentTheme("maroon");
    setFontSizeMultiplier(1);
    setHighContrast(false);
    if (setDyslexicFont) setDyslexicFont(false);
    setSpeechEnabled(false);
    speakText("Workspace settings reset to defaults.");
  };

  const tetrisControlClass = "flex items-center justify-center py-2 rounded-xl border border-gray-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
  const tetrisPrimaryClass = "flex-1 py-2 bg-gradient-to-r from-brand-maroon to-brand-maroon-dark text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer hover:opacity-95";
  const tetrisSecondaryClass = "px-3 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer";

  return (
    <div className="space-y-6 text-left">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Profile Card and Bio */}
      <div className="space-y-4 sm:space-y-6">
        <div className="glass-card rounded-2xl p-5 sm:p-6 text-center space-y-4 relative overflow-hidden bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 shadow-sm">
          <div className="absolute top-0 inset-x-0 h-2 bg-brand-maroon" />
          
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-maroon/5 dark:bg-brand-maroon/20 rounded-full flex items-center justify-center mx-auto border-2 border-brand-maroon/20">
            <User className="w-8 h-8 sm:w-10 sm:h-10 text-brand-maroon dark:text-brand-maroon-light" />
          </div>

          <div>
            <h3 className="font-display font-black text-gray-900 dark:text-neutral-100 text-base leading-tight">
              {currentUserName}
            </h3>
            <p className="text-xs text-gray-400 dark:text-neutral-400 mt-1 break-all">{normalizeEmail(currentUserEmail)}</p>
          </div>

          <div className="flex justify-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-0.5 bg-brand-maroon/5 dark:bg-brand-maroon/20 text-brand-maroon dark:text-brand-maroon-light border border-brand-maroon/15 dark:border-brand-maroon/40 text-[10px] font-bold uppercase rounded-full">
              {currentUserRole}
            </span>
            <span className="px-2.5 py-0.5 bg-gray-50 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 border border-gray-100 dark:border-neutral-700 text-[10px] font-bold uppercase rounded-full">
              {currentMember.college}
            </span>
          </div>

          <div className="border-t pt-4 border-gray-100 dark:border-neutral-800 grid grid-cols-1 gap-2 text-xs">
            <div>
              <span className="text-gray-400 dark:text-neutral-400 block text-[9px] font-semibold uppercase">Total Tasks</span>
              <span className="font-mono font-bold text-gray-800 dark:text-neutral-200 text-sm">{memberTasks.length}</span>
            </div>
          </div>

          <button
            onClick={() => {
              onLogout();
              speakText("Logged out of layout workspace successfully.");
            }}
            className="w-full py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Log Out Workspace
          </button>
        </div>

        {/* Official Account Details & Security Credentials Card */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-3 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 shadow-sm">
          <div className="flex items-center justify-between border-b pb-2 border-gray-100 dark:border-neutral-800">
            <div className="flex items-center gap-2 text-brand-maroon dark:text-brand-maroon-light">
              <ShieldCheck className="w-4 h-4" />
              <h4 className="font-bold text-xs text-gray-900 dark:text-neutral-100">
                Official Account Details
              </h4>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              Verified
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {/* College Affiliation */}
            <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-neutral-800/60">
              <span className="text-gray-400 dark:text-neutral-400 text-[11px] flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" /> College
              </span>
              <span className="font-mono font-bold text-gray-800 dark:text-neutral-200 text-xs bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                {userCollege}
              </span>
            </div>

            {/* Official UP Mail */}
            <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-neutral-800/60">
              <span className="text-gray-400 dark:text-neutral-400 text-[11px] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> UP Mail
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-gray-800 dark:text-neutral-200 max-w-[130px] truncate">
                  {normalizeEmail(currentUserEmail)}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(currentUserEmail, "user-email", "UP Webmail")}
                  className="text-gray-400 hover:text-brand-maroon p-0.5 rounded cursor-pointer"
                  title="Copy email"
                >
                  {copiedField === "user-email" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Contact Number */}
            <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-neutral-800/60">
              <span className="text-gray-400 dark:text-neutral-400 text-[11px] flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Contact
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-gray-800 dark:text-neutral-200">
                  +63 {userContact}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(`+63 ${userContact}`, "user-contact", "contact number")}
                  className="text-gray-400 hover:text-brand-maroon p-0.5 rounded cursor-pointer"
                  title="Copy contact"
                >
                  {copiedField === "user-contact" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Alphanumeric Password */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400 dark:text-neutral-400 text-[11px] flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-brand-maroon" /> Account Password
                </span>
                <span className="text-[9px] font-mono uppercase text-gray-400">Alphanumeric</span>
              </div>
              <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/80 border border-gray-200 dark:border-neutral-700 rounded-lg px-2.5 py-1.5">
                <span className="font-mono font-bold text-xs tracking-wider text-neutral-900 dark:text-neutral-100">
                  {showUserPassword ? userPin : "••••••••"}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowUserPassword(!showUserPassword)}
                    className="text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200 p-0.5 rounded cursor-pointer"
                    title={showUserPassword ? "Hide" : "Show"}
                  >
                    {showUserPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(userPin, "user-pin", "password")}
                    className="text-gray-400 hover:text-brand-maroon p-0.5 rounded cursor-pointer"
                    title="Copy password"
                  >
                    {copiedField === "user-pin" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Lead/Editor view for Section Accounts */}
            {(currentUserRole === "Layout Editor" || currentUserRole === "Online Layout Head") && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowSectionRoster(!showSectionRoster)}
                  className="w-full py-1.5 px-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{showSectionRoster ? "Hide Section Passwords" : "View All 7 Section Passwords"}</span>
                </button>

                {showSectionRoster && (
                  <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {OFFICIAL_ACCOUNTS.map((acc) => (
                      <div
                        key={acc.email}
                        className="p-1.5 bg-neutral-50 dark:bg-neutral-800/60 rounded border border-gray-100 dark:border-neutral-700 flex items-center justify-between text-[10px]"
                      >
                        <div className="truncate mr-2">
                          <p className="font-bold text-neutral-800 dark:text-neutral-200 truncate">{acc.name}</p>
                          <p className="text-gray-400 font-mono">{acc.college} • +63 {acc.contact}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <code className="font-mono font-bold text-neutral-900 dark:text-neutral-100 px-1 py-0.5 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded">
                            {acc.pin}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopy(acc.pin, `roster-${acc.email}`, "password")}
                            className="p-0.5 text-gray-400 hover:text-brand-maroon cursor-pointer"
                            title="Copy"
                          >
                            {copiedField === `roster-${acc.email}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Workspace Google Drive Integration Card */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-2.5 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 shadow-sm">
          <div className="flex items-center gap-2 text-brand-maroon dark:text-brand-maroon-light">
            <FolderOpen className="w-4 h-4" />
            <h4 className="font-bold text-xs text-gray-900 dark:text-neutral-100">MKule '26-'27 Layout Drive</h4>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-neutral-400 leading-normal">
            Connected to official MKule Google Drive workspace repository for layout assets and issue templates.
          </p>
          <a
            href="https://drive.google.com/drive/folders/1IKOK2njjP5SO15gjxIWB-wcZfZgUW76e?usp=drive_link"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 px-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open MKule '26-'27 Layout Drive
          </a>
        </div>
      </div>

      {/* Profile settings Panel */}
      <div className="lg:col-span-2 space-y-4 sm:space-y-6">
        <div className="glass-card rounded-2xl p-4 sm:p-6 space-y-5 sm:space-y-6 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 shadow-sm">
          
          <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-brand-maroon dark:text-brand-maroon-light" />
              <h3 className="font-display font-bold text-gray-950 dark:text-neutral-100 text-base">Workspace Configuration</h3>
            </div>
            <button
              onClick={handleResetDefaults}
              className="text-[11px] text-brand-maroon dark:text-brand-maroon-light hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              title="Reset all settings to default"
            >
              <RefreshCw className="w-3 h-3" /> Reset Defaults
            </button>
          </div>

          <div className="space-y-5 text-xs">
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-gradient-to-br from-gray-50 via-white to-red-50 dark:from-neutral-800 dark:via-neutral-900 dark:to-red-950/30 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-brand-maroon dark:text-brand-maroon-light">
                    <Award className="w-4 h-4" />
                    <h4 className="font-bold text-xs text-gray-900 dark:text-neutral-100">Workload Tracker</h4>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-neutral-400 mt-1">Monthly and semester workload overview</p>
                </div>
                <div className="inline-flex rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setStatsMode("semester")}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer ${statsMode === "semester" ? "bg-brand-maroon text-white" : "text-gray-600 dark:text-neutral-300"}`}
                  >
                    Semester
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatsMode("month")}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer ${statsMode === "month" ? "bg-brand-maroon text-white" : "text-gray-600 dark:text-neutral-300"}`}
                  >
                    Month
                  </button>
                </div>
              </div>

              {statsMode === "semester" ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5">
                    <div className="text-[9px] uppercase text-gray-400 dark:text-neutral-500">Total</div>
                    <div className="font-black text-base text-gray-900 dark:text-neutral-100">{memberTasks.length}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5">
                    <div className="text-[9px] uppercase text-gray-400 dark:text-neutral-500">Completed</div>
                    <div className="font-black text-base text-emerald-600">{completedWork}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5">
                    <div className="text-[9px] uppercase text-gray-400 dark:text-neutral-500">Active</div>
                    <div className="font-black text-base text-brand-maroon dark:text-brand-maroon-light">{activeWork}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {monthOrder.map((month) => (
                      <button
                        key={month}
                        type="button"
                        onClick={() => setSelectedMonth(month)}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer ${selectedMonth === month ? "bg-neutral-900 text-white" : "bg-white dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 border border-gray-200 dark:border-neutral-700"}`}
                      >
                        {month.slice(0, 3)}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {monthCounts.map(({ month, count }) => {
                      const width = Math.max(count * 18, count > 0 ? 16 : 4);
                      return (
                        <div key={month} className={`flex items-center gap-2 text-[10px] ${selectedMonth === month ? "text-brand-maroon dark:text-brand-maroon-light" : "text-gray-600 dark:text-neutral-300"}`}>
                          <span className="w-12 shrink-0">{month.slice(0, 3)}</span>
                          <div className="h-2.5 flex-1 rounded-full bg-gray-200 dark:bg-neutral-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${count > 0 ? "bg-gradient-to-r from-brand-maroon to-brand-maroon-light" : "bg-gray-200 dark:bg-neutral-700"}`}
                              style={{ width: `${Math.min(width, 100)}%` }}
                            />
                          </div>
                          <span className="w-5 text-right font-bold">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-gray-200 dark:border-neutral-700 pt-2 text-[10px] text-gray-500 dark:text-neutral-400">
                <span>Peak month</span>
                <span className="font-bold text-gray-800 dark:text-neutral-200">{peakMonth.month} • {peakMonth.count}</span>
              </div>
            </div>

              {isLayoutProbi && (
                <div className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-gradient-to-br from-gray-50 via-white to-amber-50 dark:from-neutral-800 dark:via-neutral-900 dark:to-amber-950/30 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-brand-maroon dark:text-brand-maroon-light">
                        <GraduationCap className="w-4 h-4" />
                        <h4 className="font-bold text-xs text-gray-900 dark:text-neutral-100">Probi Tracker</h4>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-neutral-400 mt-1">Term requirements for graduation to layout staffer</p>
                    </div>
                    {probiGraduated && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full shrink-0">Graduated</span>
                    )}
                  </div>

                  {probiGraduated && (
                    <div className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 via-white to-emerald-50 dark:from-neutral-900 dark:via-neutral-900 dark:to-emerald-950/40 p-4 text-center space-y-2">
                      <Trophy className="w-6 h-6 text-amber-500 mx-auto" />
                      <p className="text-xs font-bold text-gray-900 dark:text-neutral-100 italic leading-relaxed">
                        {probiTracker?.congratsMessage || DEFAULT_PROBI_CONGRATS_MESSAGE}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-gray-700 dark:text-neutral-200 flex items-center gap-1.5">
                        <CheckCircle className={`w-3.5 h-3.5 ${probiTaskDoneCount >= 8 ? "text-emerald-600" : "text-gray-300 dark:text-neutral-600"}`} />
                        Issue or Online Tasks Completed
                      </span>
                      <span className="font-bold text-gray-900 dark:text-neutral-100">{Math.min(probiTaskDoneCount, 8)} / 8</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-neutral-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-maroon to-brand-maroon-light"
                        style={{ width: `${Math.min((probiTaskDoneCount / 8) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] pt-1">
                      <span className="font-semibold text-gray-700 dark:text-neutral-200 flex items-center gap-1.5">
                        <CheckCircle className={`w-3.5 h-3.5 ${probiOpinionDone >= 1 ? "text-emerald-600" : "text-gray-300 dark:text-neutral-600"}`} />
                        Opinion article completed
                      </span>
                      <span className="font-bold text-gray-900 dark:text-neutral-100">{Math.min(probiOpinionDone, 1)} / 1</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="url"
                        value={probiDocLink}
                        onChange={(e) => setProbiDocLink(e.target.value)}
                        placeholder="Paste opinion article docs link"
                        className="flex-1 min-w-0 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-[11px] text-gray-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-brand-maroon"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!probiDocLink.trim() || !onSubmitOpinionArticle) return;
                          onSubmitOpinionArticle(probiDocLink);
                          setProbiDocLink("");
                          speakText("Opinion article submitted to the layout editor and deputy.");
                        }}
                        className="text-[10px] font-bold text-white bg-brand-maroon hover:bg-brand-maroon-dark px-2.5 py-1.5 rounded-lg shrink-0 cursor-pointer"
                      >
                        Submit
                      </button>
                    </div>
                    <p className="text-[9px] text-gray-400 dark:text-neutral-500">
                      Submissions go to the Layout Editor and Layout Deputy for review and marking as done.
                    </p>
                  </div>
                </div>
              )}

            {/* Dark / Light Mode Selector */}
            <div className="space-y-2">
              <label className="font-semibold text-gray-700 dark:text-neutral-200 flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-500" /> Appearance & Contrast Theme
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (setDarkMode) setDarkMode(false);
                    speakText("Light mode enabled");
                  }}
                  className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all text-left cursor-pointer ${
                    !darkMode 
                      ? "border-brand-maroon bg-brand-cream/30 text-brand-maroon-dark font-bold shadow-xs ring-1 ring-brand-maroon/30" 
                      : "border-gray-200 dark:border-neutral-750 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400"
                  }`}
                >
                  <Sun className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <span className="block font-bold text-xs text-gray-900 dark:text-neutral-100">Light Mode</span>
                    <span className="block text-[10px] text-gray-500 dark:text-neutral-400">Crisp ivory canvas with high contrast</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (setDarkMode) setDarkMode(true);
                    speakText("Dark mode enabled");
                  }}
                  className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all text-left cursor-pointer ${
                    darkMode 
                      ? "border-brand-maroon bg-brand-maroon/15 dark:bg-brand-maroon/30 text-brand-maroon-light dark:text-brand-maroon-light font-bold shadow-xs ring-1 ring-brand-maroon/30" 
                      : "border-gray-200 dark:border-neutral-750 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400"
                  }`}
                >
                  <Moon className="w-5 h-5 text-indigo-400 shrink-0" />
                  <div>
                    <span className="block font-bold text-xs text-gray-900 dark:text-neutral-100">Dark Mode</span>
                    <span className="block text-[10px] text-gray-500 dark:text-neutral-400">Dark canvas with legible light text</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Visual themes */}
            <div className="space-y-2 border-t pt-4 border-gray-100 dark:border-neutral-800">
              <label className="font-semibold text-gray-700 dark:text-neutral-200 flex items-center gap-2">
                <Palette className="w-4 h-4 text-brand-maroon dark:text-brand-maroon-light" /> Brand Accent Color
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ACCENT_OPTIONS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleAccentChange(item.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      accentTheme === item.id 
                        ? "border-brand-maroon bg-brand-cream/30 dark:bg-brand-maroon/20 text-brand-maroon-dark dark:text-brand-maroon-light font-bold ring-1 ring-brand-maroon/30" 
                        : "border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-500 dark:text-neutral-400"
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>

        </div>
        {/* Task Archive: accomplished layouts, scrollable history */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 pb-2">
            <div className="flex items-center gap-2 text-brand-maroon dark:text-brand-maroon-light">
              <FolderOpen className="w-4 h-4" />
              <h4 className="font-bold text-xs text-gray-900 dark:text-neutral-100">Task Archive</h4>
            </div>
            <span className="text-[10px] font-mono font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-2 py-0.5 rounded-full">
              {archivedTasks.length} accomplished
            </span>
          </div>

          {archivedTasks.length === 0 ? (
            <p className="text-[11px] text-gray-400 dark:text-neutral-500 py-3 text-center">
              No accomplished tasks yet. Layouts approved by the Layout Editor will be archived here.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {archivedTasks.map((task: any) => (
                <div key={task.id} className="flex items-center justify-between gap-2 p-2 bg-neutral-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-700 rounded-lg text-[11px]">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 dark:text-neutral-200 truncate">{task.title}</p>
                    <p className="text-[10px] text-gray-400 dark:text-neutral-500 truncate">
                      {task.typeOfRelease} • {task.typeOfContent}
                      {task.sourceSheetTitle ? ` • Sheet: ${task.sourceSheetTitle}` : ""} • Target: {task.releaseDate || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[9px] font-bold uppercase">
                    {task.progress}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* MKule Tetris Break — 3-round mini-game filling the blank space at the page foot */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-brand-maroon dark:text-brand-maroon-light" />
            <div>
              <h3 className="font-display font-bold text-gray-950 dark:text-neutral-100 text-sm">MKule Tetris Break</h3>
              <p className="text-[10px] text-gray-500 dark:text-neutral-400">A quick 3-round layout break — clear {TETRIS_LINES_PER_ROUND} lines per round.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono font-bold">
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">Round {tetris.round}/{TETRIS_TOTAL_ROUNDS}</span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">Lines {tetris.totalLines}</span>
            <span className="px-2 py-0.5 rounded-full bg-brand-maroon/10 dark:bg-brand-maroon/20 text-brand-maroon dark:text-brand-maroon-light">Score {tetris.score}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center sm:items-start">
          {/* Playfield */}
          <div className="grid grid-cols-10 gap-0.5 p-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 shrink-0">
            {tetrisView.flatMap((row, y) =>
              row.map((cell, x) => (
                <div
                  key={`${y}-${x}`}
                  className={`w-4 h-4 sm:w-5 sm:h-5 rounded-[3px] ${cell ? `${cell} border border-black/10` : "bg-white dark:bg-neutral-900"}`}
                />
              ))
            )}
          </div>

          {/* Round info, message and controls */}
          <div className="flex-1 w-full space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500 dark:text-neutral-400">
                <span>Round progress</span>
                <span>{tetris.linesInRound}/{TETRIS_LINES_PER_ROUND} lines</span>
              </div>
              <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div className="h-full bg-brand-maroon transition-all duration-300" style={{ width: `${Math.min(100, (tetris.linesInRound / TETRIS_LINES_PER_ROUND) * 100)}%` }} />
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                {Array.from({ length: TETRIS_TOTAL_ROUNDS }, (_, i) => i + 1).map(r => (
                  <span
                    key={r}
                    className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center border ${
                      r < tetris.round || tetris.status === "won"
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : r === tetris.round && tetris.status !== "idle"
                          ? "bg-brand-maroon border-brand-maroon text-white"
                          : "bg-neutral-100 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-neutral-400"
                    }`}
                  >
                    {r < tetris.round || tetris.status === "won" ? <Check className="w-3 h-3" /> : r}
                  </span>
                ))}
              </div>
            </div>

            <div className="min-h-[36px] rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-700 px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-neutral-200 flex items-center gap-2">
              {tetris.status === "won" && <Trophy className="w-4 h-4 text-amber-500 shrink-0" />}
              <span className="truncate">{tetris.message}</span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              <button type="button" onMouseDown={(e) => e.preventDefault()} disabled={tetris.status !== "playing"} onClick={() => setTetris(prev => tetrisMoveHorizontal(prev, -1))} className={tetrisControlClass} title="Move left" aria-label="Move left">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} disabled={tetris.status !== "playing"} onClick={() => setTetris(prev => tetrisRotate(prev))} className={tetrisControlClass} title="Rotate" aria-label="Rotate piece">
                <RotateCw className="w-4 h-4" />
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} disabled={tetris.status !== "playing"} onClick={() => setTetris(prev => tetrisMoveHorizontal(prev, 1))} className={tetrisControlClass} title="Move right" aria-label="Move right">
                <ArrowRight className="w-4 h-4" />
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} disabled={tetris.status !== "playing"} onClick={() => setTetris(prev => tetrisStepDown(prev))} className={tetrisControlClass} title="Soft drop" aria-label="Soft drop">
                <ArrowDown className="w-4 h-4" />
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} disabled={tetris.status !== "playing"} onClick={() => setTetris(prev => tetrisHardDrop(prev))} className={tetrisControlClass} title="Hard drop" aria-label="Hard drop">
                <ChevronsDown className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-neutral-500">Keyboard: ← → move • ↑ rotate • ↓ soft drop • Space hard drop • Enter to start</p>

            <div className="flex gap-2">
              {tetris.status === "idle" && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setTetris(tetrisNewGame())} className={tetrisPrimaryClass}>
                  <Play className="w-3.5 h-3.5" /> Start Game
                </button>
              )}
              {tetris.status === "playing" && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setTetris(tetrisNewGame())} className={tetrisSecondaryClass}>
                  <RefreshCw className="w-3.5 h-3.5" /> Restart
                </button>
              )}
              {tetris.status === "roundComplete" && (
                <>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setTetris(prev => tetrisNextRound(prev))} className={tetrisPrimaryClass}>
                    <Play className="w-3.5 h-3.5" /> Start Round {tetris.round + 1}
                  </button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setTetris(tetrisNewGame())} className={tetrisSecondaryClass}>
                    <RefreshCw className="w-3.5 h-3.5" /> Restart
                  </button>
                </>
              )}
              {tetris.status === "over" && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setTetris(tetrisNewGame())} className={tetrisPrimaryClass}>
                  <RefreshCw className="w-3.5 h-3.5" /> Try Again
                </button>
              )}
              {tetris.status === "won" && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setTetris(tetrisNewGame())} className={tetrisPrimaryClass}>
                  <RefreshCw className="w-3.5 h-3.5" /> Play Again
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
