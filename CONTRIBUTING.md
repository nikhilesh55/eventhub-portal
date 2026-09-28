# Contributing to EventHub

Thank you for your interest in contributing to **EventHub: Event Booking & QR Check-In Portal**!

## 🛠️ Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/eventhub-portal.git
   cd eventhub-portal
   ```

2. **Verify tests pass out-of-the-box**:
   ```bash
   python3 tests/test_api.py
   ```

3. **Start the local development server**:
   ```bash
   python3 app.py
   ```
   Open `http://127.0.0.1:8080/` in your browser.

---

## 🧪 Testing Guidelines

- Every new feature, route, or database constraint MUST have a corresponding test in `tests/test_api.py`.
- Run the full suite before opening a pull request:
  ```bash
  python3 tests/test_api.py
  ```

---

## 📜 Pull Request Process

1. Create a feature branch: `git checkout -b feature/amazing-feature`.
2. Commit your changes: `git commit -m 'feat: Add amazing feature'`.
3. Push to the branch: `git push origin feature/amazing-feature`.
4. Open a Pull Request on GitHub with a description of the changes and test evidence.

---

## ⚖️ Code Style
- Python code should conform to standard PEP 8.
- Maintain documentation integrity and preserve all relational database constraints.
