import { useEffect, useState } from "react"
import { socket } from "./socket"

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected)

  const [playerName, setPlayerName] = useState("")
  const [nameSet, setNameSet] = useState(false)

  const [appPhase, setAppPhase] = useState("mode-select")
  const [selectedMode, setSelectedMode] = useState(null)
  const [roomCode, setRoomCode] = useState(null)
  const [joinCodeInput, setJoinCodeInput] = useState("")
  const [joinError, setJoinError] = useState("")

  const [mode, setMode] = useState(null)
  const [gamePhase, setGamePhase] = useState("waiting")
  const [range, setRange] = useState({ min: 1, max: 30 })
  const [participants, setParticipants] = useState([])
  const [pickerId, setPickerId] = useState(null)
  const [pickerName, setPickerName] = useState(null)
  const [guessLog, setGuessLog] = useState([])
  const [winnerName, setWinnerName] = useState(null)
  const [pointsEarned, setPointsEarned] = useState(null)
  const [confirmedNumber, setConfirmedNumber] = useState(null)
  const [scoreboard, setScoreboard] = useState([])
  const [timedOut, setTimedOut] = useState(false)

  const [roundEndsAt, setRoundEndsAt] = useState(null)
  const [timeLeft, setTimeLeft] = useState(null)

  const [guessInput, setGuessInput] = useState("")
  const [rangeInput, setRangeInput] = useState({ min: 1, max: 30 })
  const [numberInput, setNumberInput] = useState("")

  const isPicker = mode === "vs-player" && socket.id === pickerId

  useEffect(() => {
    function onConnect() { setIsConnected(true) }
    function onDisconnect() { setIsConnected(false) }

    function onRoomCreated(data) {
      setRoomCode(data.roomCode)
      setAppPhase("playing")
    }

    function onRoomJoined(data) {
      setRoomCode(data.roomCode)
      setAppPhase("playing")
    }

    function onJoinError(data) {
      setJoinError(data.message)
    }

    function onGameStatus(data) {
      setMode(data.mode)
      setGamePhase(data.phase)
      if (data.range) setRange(data.range)
      if (data.participants) setParticipants(data.participants)
      setPickerId(data.pickerId ?? null)
      setPickerName(data.pickerName ?? null)
      if (data.scoreboard) setScoreboard(data.scoreboard)
      setRoundEndsAt(data.roundEndsAt ?? null)

      if (data.phase === "playing" || data.phase === "range-set") {
        setWinnerName(null)
        setPointsEarned(null)
        setGuessLog([])
        setConfirmedNumber(null)
        setTimedOut(false)
      }
    }

    function onRangeUpdated(newRange) {
      setRange(newRange)
    }

    function onNumberConfirmed(data) {
      setConfirmedNumber(data.number)
    }

    function onGuessResult(data) {
      setGuessLog(prev => [...prev, data.entry])
      if (data.entry.won) {
        setWinnerName(data.entry.playerName)
        setPointsEarned(data.pointsEarned)
      }
    }

    function onRoundTimeout() {
      setTimedOut(true)
    }

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.on("room-created", onRoomCreated)
    socket.on("room-joined", onRoomJoined)
    socket.on("join-error", onJoinError)
    socket.on("game-status", onGameStatus)
    socket.on("range-updated", onRangeUpdated)
    socket.on("number-confirmed", onNumberConfirmed)
    socket.on("guess-result", onGuessResult)
    socket.on("round-timeout", onRoundTimeout)

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("room-created", onRoomCreated)
      socket.off("room-joined", onRoomJoined)
      socket.off("join-error", onJoinError)
      socket.off("game-status", onGameStatus)
      socket.off("range-updated", onRangeUpdated)
      socket.off("number-confirmed", onNumberConfirmed)
      socket.off("guess-result", onGuessResult)
      socket.off("round-timeout", onRoundTimeout)
    }
  }, [])

  useEffect(() => {
    if (!roundEndsAt) {
      setTimeLeft(null)
      return
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((roundEndsAt - Date.now()) / 1000))
      setTimeLeft(remaining)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [roundEndsAt])

  function handleModeSelect(chosenMode) {
    setSelectedMode(chosenMode)
    setAppPhase("room-choice")
  }

  function handleCreateRoom() {
    socket.emit("create-room", {
      mode: selectedMode,
      range: { min: 1, max: 30 },
      name: playerName,
    })
  }

  function handleJoinRoom(e) {
    e.preventDefault()
    setJoinError("")
    const code = joinCodeInput.trim().toUpperCase()
    socket.emit("join-room", { roomCode: code, name: playerName })
  }

  function handleSetRange(e) {
    e.preventDefault()
    socket.emit("set-range", {
      roomCode,
      min: Number(rangeInput.min),
      max: Number(rangeInput.max),
    })
  }

  function handlePickNumber(e) {
    e.preventDefault()
    socket.emit("pick-number", { roomCode, number: Number(numberInput) })
    setNumberInput("")
  }

  function handleRandomize() {
    socket.emit("randomize-number", { roomCode })
  }

  function handleGuess(e) {
    e.preventDefault()
    socket.emit("make-guess", { roomCode, guess: Number(guessInput) })
    setGuessInput("")
  }

  const inputClasses = "w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
  const primaryBtn = "rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition px-4 py-2 font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
  const secondaryBtn = "rounded-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-800 transition px-4 py-2 font-medium text-slate-100"
  const card = "rounded-2xl bg-slate-800/60 border border-slate-700 p-6 shadow-xl"

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">

        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">🎯 Guessing Game</h1>
          <p className={`text-sm ${isConnected ? "text-emerald-400" : "text-red-400"}`}>
            {isConnected ? "● Connected" : "● Disconnected"}
          </p>
        </div>

        {!nameSet && (
          <div className={card + " space-y-4"}>
            <h2 className="text-lg font-semibold">Enter your name</h2>
            <input
              className={inputClasses}
              placeholder="Your name"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
            />
            <button
              className={primaryBtn + " w-full"}
              onClick={() => setNameSet(true)}
              disabled={!playerName.trim()}
            >
              Continue
            </button>
          </div>
        )}

        {nameSet && appPhase === "mode-select" && (
          <div className={card + " space-y-4"}>
            <h2 className="text-lg font-semibold">Choose a mode</h2>
            <div className="grid grid-cols-1 gap-3">
              <button className={primaryBtn} onClick={() => handleModeSelect("vs-computer")}>
                🤖 vs Computer
              </button>
              <button className={primaryBtn} onClick={() => handleModeSelect("vs-player")}>
                👥 vs Player
              </button>
            </div>
          </div>
        )}

        {appPhase === "room-choice" && (
          <div className={card + " space-y-4"}>
            <h2 className="text-lg font-semibold">
              {selectedMode === "vs-computer" ? "🤖 vs Computer" : "👥 vs Player"}
            </h2>

            <button className={primaryBtn + " w-full"} onClick={handleCreateRoom}>
              Create Room
            </button>

            <div className="flex items-center gap-3 text-slate-500 text-sm">
              <div className="h-px flex-1 bg-slate-700" />
              or
              <div className="h-px flex-1 bg-slate-700" />
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-3">
              <input
                className={inputClasses + " uppercase tracking-widest text-center font-mono"}
                placeholder="ROOM CODE"
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value)}
              />
              <button type="submit" className={secondaryBtn + " w-full"}>
                Join Room
              </button>
            </form>
            {joinError && <p className="text-red-400 text-sm text-center">{joinError}</p>}
          </div>
        )}

        {appPhase === "playing" && (
          <div className="space-y-4">

            <div className={card + " space-y-2"}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Room Code</span>
                <span className="font-mono font-bold text-indigo-400 text-lg tracking-widest">{roomCode}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="bg-slate-700/60 rounded-full px-2 py-1">{mode}</span>
                <span className="bg-slate-700/60 rounded-full px-2 py-1 capitalize">{gamePhase}</span>
                {mode === "vs-player" && pickerName && (
                  <span className="bg-slate-700/60 rounded-full px-2 py-1">🎯 Picker: {pickerName}</span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Players: {participants.map(p => p.name).join(", ")}
              </p>
            </div>

            {gamePhase === "playing" && timeLeft !== null && (
              <div className={card}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Time left</span>
                  <span className={`font-mono font-bold text-lg ${timeLeft <= 10 ? "text-red-400" : "text-slate-100"}`}>
                    {timeLeft}s
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${timeLeft <= 10 ? "bg-red-500" : "bg-indigo-500"}`}
                    style={{ width: `${(timeLeft / 60) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {gamePhase === "waiting" && mode === "vs-player" && (
              <div className={card + " text-center text-slate-400"}>
                Waiting for another player to join…
              </div>
            )}

            {gamePhase === "over" && (
              <div className={card + " text-center space-y-3 border-indigo-500/50"}>
                {timedOut ? (
                  <p className="text-xl font-bold text-amber-400">⏰ Time's up! No one guessed it.</p>
                ) : (
                  <div>
                    <p className="text-xl font-bold text-emerald-400">🎉 {winnerName} won!</p>
                    <p className="text-sm text-slate-400">
                      {guessLog.length} guesses · +{pointsEarned} points
                    </p>
                  </div>
                )}
                <button
                  className={primaryBtn}
                  onClick={() => socket.emit("play-again", { roomCode })}
                >
                  Play Again{mode === "vs-player" && " →"}
                </button>
              </div>
            )}

            {isPicker && gamePhase !== "playing" && gamePhase !== "over" && (
              <div className={card + " space-y-4"}>
                <p className="text-sm text-indigo-400 font-medium">🎯 It's your turn to pick!</p>

                <form onSubmit={handleSetRange} className="space-y-2">
                  <label className="text-xs text-slate-400">Range</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className={inputClasses}
                      value={rangeInput.min}
                      onChange={e => setRangeInput({ ...rangeInput, min: e.target.value })}
                    />
                    <input
                      type="number"
                      className={inputClasses}
                      value={rangeInput.max}
                      onChange={e => setRangeInput({ ...rangeInput, max: e.target.value })}
                    />
                    <button type="submit" className={secondaryBtn}>Set</button>
                  </div>
                </form>

                <form onSubmit={handlePickNumber} className="space-y-2">
                  <label className="text-xs text-slate-400">Secret number ({range.min}–{range.max})</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className={inputClasses}
                      value={numberInput}
                      onChange={e => setNumberInput(e.target.value)}
                      placeholder="Pick a number"
                    />
                    <button type="submit" className={primaryBtn}>Set</button>
                  </div>
                </form>

                <button className={secondaryBtn + " w-full"} onClick={handleRandomize}>
                  🎲 Randomize Instead
                </button>

                {confirmedNumber !== null && (
                  <p className="text-xs text-slate-500 text-center">
                    Secret number set to <span className="font-bold text-slate-300">{confirmedNumber}</span> (only you can see this)
                  </p>
                )}
              </div>
            )}

            {!isPicker && gamePhase === "playing" && (
              <form onSubmit={handleGuess} className={card + " flex gap-2"}>
                <input
                  type="number"
                  className={inputClasses}
                  value={guessInput}
                  onChange={e => setGuessInput(e.target.value)}
                  placeholder={`Guess (${range.min}-${range.max})`}
                  autoFocus
                />
                <button type="submit" className={primaryBtn}>Guess</button>
              </form>
            )}

            {scoreboard.length > 0 && (
              <div className={card + " space-y-2"}>
                <h3 className="text-sm font-semibold text-slate-400">🏆 Scoreboard</h3>
                <ul className="space-y-1">
                  {scoreboard.map((entry, i) => (
                    <li key={entry.id} className="flex items-center justify-between text-sm">
                      <span className={i === 0 ? "font-semibold text-amber-400" : "text-slate-300"}>
                        {i === 0 && "👑 "}{entry.name}
                      </span>
                      <span className="font-mono text-slate-400">{entry.score} pts</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {guessLog.length > 0 && (
              <div className={card + " space-y-2"}>
                <h3 className="text-sm font-semibold text-slate-400">Guess Log</h3>
                <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {guessLog.map((entry, i) => {
                    const color =
                      entry.message === "Correct!" ? "text-emerald-400" :
                      entry.message === "Higher" ? "text-sky-400" :
                      "text-orange-400"
                    return (
                      <li key={i} className="flex items-center justify-between text-sm bg-slate-900/50 rounded-lg px-3 py-1.5">
                        <span className="text-slate-300">{entry.playerName || entry.playerId.slice(0, 5)}</span>
                        <span className="font-mono text-slate-500">{entry.guess}</span>
                        <span className={`font-medium ${color}`}>{entry.message}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App