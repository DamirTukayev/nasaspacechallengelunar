# nasaspacechallengelunar

NASA Space Apps Challenge — lunar track.

Инструмент для быстрого сравнения мест и дат посадки на Луне: где Солнце и Земля относительно горизонта, хватит ли энергии и есть ли прямая связь с Землёй. Задание — [docs/challenge.md](docs/challenge.md), ресурсы и данные — [docs/resources.md](docs/resources.md), план MVP и задачи — [docs/mvp-plan.md](docs/mvp-plan.md).

## Стек и версии

| Часть    | Язык / среда                        | Основные библиотеки                                              | Папка       |
|----------|-------------------------------------|------------------------------------------------------------------|-------------|
| Backend  | Python **3.11**                     | FastAPI 0.162, Pydantic 2.14, Uvicorn 0.54, httpx, NumPy 2.4; pytest, Ruff | `backend/`  |
| Frontend | Node.js **26** (минимум 22.12), TypeScript **7.0** | React 19.3, Vite 8.3, TanStack Query 5; Oxlint, Prettier | `frontend/` |

Версия Python зафиксирована в `backend/.python-version`, версия Node — в `frontend/.nvmrc`.

## Запуск

### Backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python -m app.scripts.fetch_dem   # рельеф LOLA южного полюса, 116 МБ, один раз
uvicorn app.main:app --reload
```

API — http://localhost:8000, документация — http://localhost:8000/docs.

Рельеф (`ldem_75s_120m`, 75–90° ю.ш., 120 м/пиксель) скачивается в `backend/data/dem/` и в git не попадает. Без него бэкенд работает, но горизонт везде считается ровным (`horizon_kind: "sphere"`). Если интернет медленный, есть вариант поменьше — `python -m app.scripts.fetch_dem ldem_75s_240m` (29 МБ) и `DEM_NAME=ldem_75s_240m` в `backend/.env`.

Тесты и линтер:

```bash
pytest
ruff check . && ruff format --check .
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Приложение — http://localhost:5173. Чтобы работать без бэкенда, поставь `VITE_USE_MOCKS=true` в `frontend/.env`.

Проверки:

```bash
npm run lint
npm run typecheck
npm run format:check
```

## Участие

Как устроена работа с ветками, коммитами и PR — в [CONTRIBUTING.md](CONTRIBUTING.md).
