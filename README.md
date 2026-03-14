# ♟️ React Chess | Play Online with Stockfish AI

A high-performance, browser-based chess game built with modern web technologies: **Vite**, **React**, and **TypeScript**. 

Play a seamless game of chess with a friend locally or challenge the powerful **Stockfish-powered AI** (web worker). This project features a robust rules engine that handles move generation, legal move validation, special moves (castling, en passant), and draw rules.

## 🚀 Highlights

- **Full Rules Engine**: Custom-built in TypeScript, ensuring accurate gameplay.
- **Stockfish AI Integration**: Play against a world-class AI engine running directly in your browser using Web Workers.
- **Interactive UI**: Smooth click-and-drag interactions, move history, and captured pieces tracking.
- **Modern Tech Stack**: Leverages React 19, Vite 7, and TypeScript for a fast, responsive experience.
- **SignalR Support**: Prepared for real-time multiplayer with integrated SignalR (backend included).

## 🛠️ Tech Stack

- **Frontend**: [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **AI Engine**: [Stockfish](https://stockfishchess.org/) (via Web Worker)
- **Backend**: .NET 9 with [SignalR](https://learn.microsoft.com/en-us/aspnet/core/signalr/introduction) (optional for multiplayer)
- **Tooling**: Oxlint, Oxfmt, Vitest

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Bun](https://bun.sh/) (optional, recommended for fast package management)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/cburns/chess.git
   cd chess/frontend
   ```

2. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```

3. Start the development server:
   ```bash
   bun run dev
   ```

### Running Tests

```bash
bun test
```

### Building for Production

```bash
bun run build
```

## 📄 License

This project is licensed under the MIT License.
