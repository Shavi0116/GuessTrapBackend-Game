const express = require('express')
const http = require('http')
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: "https://guesstrap.netlify.app"
    },
})
const port = process.env.PORT || 3000

const ROUND_DURATION_MS = 60 * 1000

app.get('/', (req, res) => {
    res.send("Hello")
})

const rooms = new Map()

function createEmptyGameState() {
    return {
        mode: null,
        phase: "waiting",
        participants: [],
        pickerIndex: 0,
        range: { min: 1, max: 30 },
        secretNumber: null,
        pickerCanGuess: false,
        guessLog: [],
        scores: {},
        roundStartedAt: null,
        roundEndsAt: null,
        timeoutHandle: null,
    }
}

function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    let code = ""
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)]
    }
    return rooms.has(code) ? generateRoomCode() : code
}

function generateSecretNumber(gameState) {
    const { min, max } = gameState.range
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function currentPicker(gameState) {
    if (gameState.mode !== "vs-player") return null
    return gameState.participants[gameState.pickerIndex] || null
}

function ensureScoreEntry(gameState, player) {
    if (!gameState.scores[player.id]) {
        gameState.scores[player.id] = { name: player.name, score: 0 }
    }
}

function getScoreboard(gameState) {
    return Object.entries(gameState.scores)
        .map(([id, val]) => ({ id, name: val.name, score: val.score }))
        .sort((a, b) => b.score - a.score)
}

function clearRoundTimer(gameState) {
    if (gameState.timeoutHandle) {
        clearTimeout(gameState.timeoutHandle)
        gameState.timeoutHandle = null
    }
    gameState.roundStartedAt = null
    gameState.roundEndsAt = null
}

function startRoundTimer(roomCode) {
    const gameState = rooms.get(roomCode)
    if (!gameState) return

    clearRoundTimer(gameState)
    gameState.roundStartedAt = Date.now()
    gameState.roundEndsAt = gameState.roundStartedAt + ROUND_DURATION_MS

    gameState.timeoutHandle = setTimeout(() => {
        const gs = rooms.get(roomCode)
        if (!gs || gs.phase !== "playing") return

        gs.phase = "over"
        clearRoundTimer(gs)
        io.to(roomCode).emit("round-timeout", {})
        broadcastStatus(roomCode)
    }, ROUND_DURATION_MS)
}

function broadcastStatus(roomCode) {
    const gameState = rooms.get(roomCode)
    if (!gameState) return
    const picker = currentPicker(gameState)
    console.log(`📡 broadcastStatus for ${roomCode} — range:`, gameState.range, "phase:", gameState.phase)
    io.to(roomCode).emit("game-status", {
        phase: gameState.phase,
        mode: gameState.mode,
        range: gameState.range,
        participants: gameState.participants.map(p => ({ id: p.id, name: p.name })),
        pickerId: picker ? picker.id : null,
        pickerName: picker ? picker.name : null,
        pickerCanGuess: gameState.pickerCanGuess,
        scoreboard: getScoreboard(gameState),
        roundEndsAt: gameState.roundEndsAt,
    })
}

io.on("connection", (socket) => {
    console.log("A player connected:", socket.id)

    socket.on("create-room", ({ mode, range, name }) => {
        const roomCode = generateRoomCode()
        const gameState = createEmptyGameState()
        gameState.mode = mode
        if (range) gameState.range = range
        gameState.participants.push({ id: socket.id, name })
        ensureScoreEntry(gameState, { id: socket.id, name })
        rooms.set(roomCode, gameState)

        socket.join(roomCode)
        socket.data.roomCode = roomCode

        if (mode === "vs-computer") {
            gameState.secretNumber = generateSecretNumber(gameState)
            gameState.phase = "playing"
            startRoundTimer(roomCode)
        }

        socket.emit("room-created", { roomCode })
        broadcastStatus(roomCode)
    })

    socket.on("join-room", ({ roomCode, name }) => {
        const gameState = rooms.get(roomCode)
        if (!gameState) {
            socket.emit("join-error", { message: "Room not found" })
            return
        }

        socket.join(roomCode)
        socket.data.roomCode = roomCode
        gameState.participants.push({ id: socket.id, name })
        ensureScoreEntry(gameState, { id: socket.id, name })

        if (gameState.mode === "vs-player" && gameState.phase === "waiting" && gameState.participants.length >= 2) {
            gameState.phase = "range-set"
        }

        socket.emit("room-joined", { roomCode })
        broadcastStatus(roomCode)
    })

    socket.on("set-range", ({ roomCode, min, max }) => {
        console.log(`🎯 set-range received for ${roomCode}:`, min, max, "from socket", socket.id)
        const gameState = rooms.get(roomCode)
        if (!gameState || gameState.mode !== "vs-player") {
            console.log("❌ set-range rejected: no gameState or wrong mode")
            return
        }
        if (gameState.participants.length < 2) {
            console.log("❌ set-range rejected: fewer than 2 participants")
            return
        }
        const picker = currentPicker(gameState)
        if (!picker || socket.id !== picker.id) {
            console.log("❌ set-range rejected: sender is not the current picker")
            return
        }

        gameState.range = { min, max }
        console.log(`✅ range updated to`, gameState.range, `— broadcasting to room ${roomCode}`)
        io.to(roomCode).emit("range-updated", gameState.range)
    })

    socket.on("pick-number", ({ roomCode, number }) => {
        const gameState = rooms.get(roomCode)
        if (!gameState || gameState.mode !== "vs-player") return
        if (gameState.participants.length < 2) return
        const picker = currentPicker(gameState)
        if (!picker || socket.id !== picker.id) return

        gameState.secretNumber = number
        gameState.phase = "playing"
        gameState.guessLog = []
        gameState.pickerCanGuess = false

        socket.emit("number-confirmed", { number })
        startRoundTimer(roomCode)
        broadcastStatus(roomCode)
    })

    socket.on("randomize-number", ({ roomCode }) => {
        const gameState = rooms.get(roomCode)
        if (!gameState || gameState.mode !== "vs-player") return
        if (gameState.participants.length < 2) return
        const picker = currentPicker(gameState)
        if (!picker || socket.id !== picker.id) return

        gameState.secretNumber = generateSecretNumber(gameState)
        gameState.phase = "playing"
        gameState.guessLog = []
        gameState.pickerCanGuess = true

        socket.emit("number-confirmed", { number: gameState.secretNumber })
        startRoundTimer(roomCode)
        broadcastStatus(roomCode)
    })

    socket.on("make-guess", ({ roomCode, guess }) => {
        const gameState = rooms.get(roomCode)
        if (!gameState) return

        const guesser = gameState.participants.find(p => p.id === socket.id)
        if (!guesser) return

        const picker = currentPicker(gameState)
        const isPickerSocket = picker && socket.id === picker.id
        if (isPickerSocket && !gameState.pickerCanGuess) return

        if (gameState.phase !== "playing") return

        let message
        let won = false
        let pointsEarned = 0

        if (guess < gameState.secretNumber) {
            message = "Higher"
        } else if (guess > gameState.secretNumber) {
            message = "Lower"
        } else {
            message = "Correct!"
            won = true
            gameState.phase = "over"
        }

        const entry = { playerId: socket.id, playerName: guesser.name, guess, message, won }
        gameState.guessLog.push(entry)

        if (won) {
            const elapsedSeconds = gameState.roundStartedAt
                ? Math.floor((Date.now() - gameState.roundStartedAt) / 1000)
                : 0
            const guessCount = gameState.guessLog.length

            pointsEarned = Math.max(10, 100 - (guessCount - 1) * 5 - elapsedSeconds * 2)

            ensureScoreEntry(gameState, guesser)
            gameState.scores[socket.id].score += pointsEarned

            clearRoundTimer(gameState)
        }

        io.to(roomCode).emit("guess-result", {
            entry,
            totalGuesses: gameState.guessLog.length,
            winnerId: won ? socket.id : null,
            winnerName: won ? guesser.name : null,
            pointsEarned: won ? pointsEarned : null,
        })

        if (won) {
            broadcastStatus(roomCode)
        }
    })

    socket.on("play-again", ({ roomCode }) => {
        const gameState = rooms.get(roomCode)
        if (!gameState) return

        gameState.guessLog = []
        gameState.pickerCanGuess = false
        clearRoundTimer(gameState)

        if (gameState.mode === "vs-computer") {
            gameState.secretNumber = generateSecretNumber(gameState)
            gameState.phase = "playing"
            startRoundTimer(roomCode)
        } else {
            gameState.pickerIndex = (gameState.pickerIndex + 1) % gameState.participants.length
            gameState.secretNumber = null
            gameState.phase = gameState.participants.length >= 2 ? "range-set" : "waiting"
        }

        broadcastStatus(roomCode)
    })

    socket.on("disconnect", () => {
        console.log("A player disconnected:", socket.id)

        const roomCode = socket.data.roomCode
        if (!roomCode) return

        const gameState = rooms.get(roomCode)
        if (!gameState) return

        const leavingIndex = gameState.participants.findIndex(p => p.id === socket.id)
        gameState.participants = gameState.participants.filter(p => p.id !== socket.id)

        if (leavingIndex !== -1 && leavingIndex < gameState.pickerIndex) {
            gameState.pickerIndex -= 1
        }
        if (gameState.pickerIndex >= gameState.participants.length) {
            gameState.pickerIndex = 0
        }

        const minPlayers = gameState.mode === "vs-player" ? 2 : 1

        if (gameState.participants.length < minPlayers) {
            clearRoundTimer(gameState)
            if (gameState.participants.length === 0) {
                rooms.delete(roomCode)
                io.to(roomCode).emit("game-status", { phase: "waiting", reset: true })
            } else {
                gameState.phase = "waiting"
                gameState.secretNumber = null
                broadcastStatus(roomCode)
            }
        } else {
            if (gameState.mode === "vs-player" && gameState.phase === "playing") {
                gameState.phase = "waiting"
                gameState.secretNumber = null
                clearRoundTimer(gameState)
            }
            broadcastStatus(roomCode)
        }
    })
})

server.listen(port, () => {
    console.log(`Server is running at port ${port}`)
})