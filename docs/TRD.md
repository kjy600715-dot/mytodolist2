# TRD — My Tasks 기술 요구사항

| 항목 | 내용 |
|---|---|
| 문서 버전 | 1.1 |
| 작성일 | 2026-11-11 |
| 관련 문서 | [PRD.md](PRD.md), [TASK.md](TASK.md) |

---

## 1. 기술 스택과 제약

| 항목 | 내용 |
|---|---|
| 언어 | HTML5, CSS3, 순수 JavaScript (ES2022: `Object.hasOwn`, `?.`, `??`, `Array.prototype.at`) |
| 빌드 | 없음. `index.html`을 브라우저로 직접 연다. |
| 의존성 | 없음. 외부 라이브러리와 CDN을 쓰지 않는다. |
| 저장소 | `localStorage`. 모든 접근은 `storage` 래퍼를 거친다. |
| 지원 브라우저 | 최신 Chromium 계열과 Firefox, Safari. `<dialog>`, Pointer Events, `:has()`, `ResizeObserver`, `content-visibility` 필요 |
| 실행 환경 제약 | Node.js 미설치. 자동 검증은 헤드리스 Chrome으로 한다. |

## 2. 디렉터리 구조

```
C:\dev\todolist\
├─ index.html / style.css / script.js   # 기본판 (모바일·한 열)
├─ CLAUDE.md                            # 개발 가이드
├─ .gitignore                           # 공개 저장소 제외 목록 (conversation-*.txt, *.png)
├─ .nojekyll                            # GitHub Pages가 Jekyll 처리 없이 파일을 그대로 서빙
├─ docs\                                # 이 문서들 (PRD / TRD / TASK)
└─ web_version\                         # 데스크톱판
   ├─ index.html   # 같은 요소와 id를 .sidebar / .workspace / .workspace-top으로 감쌈
   ├─ style.css    # 기본판 스타일 + 레이아웃 섹션 추가
   ├─ script.js    # 기본판과 내용이 같음 (두 곳 모두 수정해야 함)
   └─ wdocs\       # 이 문서의 이전 판 (배포 내용 반영 전)
```

## 3. 아키텍처 요약

`script.js`는 번호가 붙은 섹션으로 나뉘어 있다: 상수 → 유틸리티 → 저장소 → 검증 → 변경 → 렌더링 → 이벤트 → 초기화. 새 코드는 해당 섹션에 넣는다.

- **요소 계약:** 모든 DOM 조회는 `dom` 객체에서 한다. 마크업의 id를 바꾸면 `dom`도 함께 바꾼다. 데스크톱판은 id를 그대로 두고 감싸는 요소만 추가했기 때문에 스크립트를 고칠 필요가 없었다.
- **상태 → 렌더링:**
  - `todos`가 원본 데이터이고, 배열 순서가 곧 "직접 정렬" 순서다.
  - 변경이 생기면 상태를 갱신하고, 저장을 예약한 뒤(300ms 디바운스) `render()`를 부른다.
- **키 기반 렌더링(`reconcileList`):** 항목을 id별로 캐시해 두고, `signatureOf(todo)`가 바뀐 항목만 다시 그린다.
- **검증:** 저장소와 가져오기 파일의 데이터는 모두 `sanitizeTodos()` 하나를 거친다.

## 4. 자동 카테고리 분류 설계

### 4.1 데이터: `CATEGORY_KEYWORDS` (상수 섹션)

```js
const CATEGORY_KEYWORDS = {
  work:     ['업무', '회의', '미팅', '보고서', /* … */ 'deploy'],
  personal: ['장보기', '마트', '운동', /* … */ 'birthday'],
  study:    ['공부', '복습', '시험', /* … */ 'tutorial'],
};
```

- 모든 키워드는 소문자로 쓰고, 한 글자 키워드는 넣지 않는다.
- 카테고리를 새로 추가할 때 함께 바꿔야 하는 곳:
  - JS: `CATEGORIES`, `CATEGORY_KEYWORDS`, `SHORTCUT_FILTERS`
  - HTML: `<option>`, 필터 버튼, `.cat-stat` 카드
  - CSS: `--color-*` 변수, `[data-category]`·`[data-filter]` 규칙

### 4.2 알고리즘: `suggestCategory(text)` (유틸리티 섹션)

1. `normalizeText`로 입력을 정리한다. 앞뒤 공백을 지우고, 연속 공백을 하나로 줄이고, 소문자로 바꾼다.
2. `CATEGORY_ORDER` 순서대로 카테고리마다 `target.includes(keyword)`로 일치하는 키워드를 센다.
3. 일치 수가 가장 많은 카테고리 하나를 `{ category, keyword }`로 돌려준다. `keyword`는 처음 일치한 키워드다.
4. 일치가 없거나 1위가 동점이면 `null`을 돌려준다.

시간 복잡도는 O(키워드 수 × 입력 길이)다. 키워드가 약 100개, 입력이 최대 200자라 입력할 때마다 실행해도 부담이 없다.

### 4.3 상태와 흐름 (상태·이벤트 섹션)

| 상태 | 의미 |
|---|---|
| `manualCategory` | 사용자가 마지막으로 직접 고른 카테고리. 처음 값은 select의 기본값 |
| `categoryLocked` | 입력 중에 직접 골랐는지 여부. `true`이면 자동 분류를 멈춤 |
| `autoCategory` | 현재 자동 분류 결과 (`{category, keyword}` 또는 `null`) |

```
input 이벤트 ─▶ applyAutoCategory() ─▶ updateInputHint()
   applyAutoCategory:
     입력이 비었으면 categoryLocked = false
     잠겨 있으면 종료
     autoCategory = suggestCategory(입력)
     select.value = autoCategory?.category ?? manualCategory
     select[data-auto] = (autoCategory !== null)

select change ─▶ manualCategory = 선택값
                 categoryLocked = (입력이 비어 있지 않음)
                 autoCategory = null, data-auto 제거, 힌트 갱신

추가 성공 ─▶ input.value = '' ─▶ applyAutoCategory()  (잠금 해제, manualCategory로 복귀)
```

### 4.4 표시

- 힌트: `setInputHint('자동 분류: …', 'auto')` → `.input-hint[data-type="auto"] { color: var(--accent-text) }`
- 선택 박스: `.category-select[data-auto]:not(:focus) { border-color: var(--accent) }`
- 힌트 우선순위: 글자 수 경고 > 자동 분류 > 기본

## 5. 데스크톱 레이아웃 설계 (`web_version`)

### 5.1 마크업

```html
<main class="app">
  <aside class="sidebar">  header · quote · stats · filter-bar · list-actions · shortcuts </aside>
  <section class="workspace">
    <div class="workspace-top"> todo-form · input-hint · toolbar </div>
    list-heading · todo-list · empty-state
  </section>
</main>
```

### 5.2 반응형 전략

| 구간 | 방식 |
|---|---|
| `< 1024px` | `.sidebar`, `.workspace`, `.workspace-top`을 `display: contents`로 풀고 `.app`을 flex 세로 배치로 바꾼다. `order`로 원래 순서를 되살린다: 사이드바 요소 → 작업 영역 요소(order 10) → 목록 관리와 단축키(order 20). 기존 `max-width: 480px` 모바일 규칙도 그대로 적용된다. |
| `≥ 1024px` | `.app { display: grid; grid-template-columns: var(--sidebar-width) minmax(0,1fr) }`. 사이드바는 `position: sticky; height: 100vh; overflow-y: auto`, `.workspace-top`은 `position: sticky; top: 0; z-index: 20`. 내용 최대 너비는 `--content-max: 1100px`. |
| `≥ 1440px` | `--sidebar-width: 380px`, 작업 영역 좌우 여백 72px |
| `≥ 1024px` 이면서 높이 `≤ 860px` | 격언을 숨기고 사이드바 간격을 줄인다. |

필터는 데스크톱에서 세로 메뉴로 바뀐다. 각 버튼 앞에 `::before`로 카테고리 색 점을 붙이고, 선택된 버튼에는 `inset` 그림자로 왼쪽 막대를 표시한다.

### 5.3 고정 바와 스크롤 보정

| 문제 | 해결 |
|---|---|
| `scrollIntoView`나 포커스 이동으로 온 항목이 바 밑에 가려짐 | `html { scroll-padding-top: var(--top-bar-space) }` |
| 바 높이가 바뀌면 보정값이 어긋남 | `ResizeObserver`가 `dom.topBar`(`.workspace-top`)를 지켜보다가 높이가 바뀌면 `--top-bar-space`를 `높이 + 8px`로 바꾼다. 높이가 0이면(좁은 화면의 `display: contents`) 무시한다. CSS의 `176px`은 스크립트가 돌기 전에만 쓰는 기본값이다. |
| 힌트가 길어 바 높이가 들쭉날쭉함 | 데스크톱에서는 `.input-hint`를 한 줄로 고정하고(`nowrap`, `ellipsis`, `min-height: 18px`) 넘치면 `…`으로 줄인다. |
| 드래그 중인 항목이 바 뒤로 숨음 | `.todo-item.dragging { z-index: 30 }` (바는 20) |
| 드래그 자동 스크롤이 창 맨 위 64px에서만 시작됨 | 드래그를 시작할 때 `drag.topInset`에 `scrollPaddingTop` 계산값을 저장하고, 위쪽 기준선을 `topInset + 64px`로 잡는다. 기본판은 값이 `auto`라 0이 되므로 동작이 그대로다. |

`dom.topBar`는 `document.querySelector('.workspace-top')`이다. 기본판에는 이 요소가 없어 `null`이 되고, 감시 코드는 실행되지 않는다. 그래서 두 `script.js`의 내용을 같게 유지할 수 있다.

### 5.4 기타

- 토스트는 작업 영역 가운데에 뜬다: `left: calc(50% + var(--sidebar-width) / 2)`.
- 저장소 경고 배너는 데스크톱에서 화면 폭 전체를 쓰는 띠로 보인다.
- 데스크톱에서는 항목 배경을 `--card`로, 완료 항목 배경을 `--surface`로 해서 구분한다.

## 6. 데이터 모델 (변경 없음)

```ts
type Todo = {
  id: string;
  text: string;          // 1~200자
  completed: boolean;
  createdAt: string;     // ISO 8601
  category: 'work' | 'personal' | 'study';
};
```

| localStorage 키 | 내용 |
|---|---|
| `todos` | Todo 배열 |
| `todoFilter` | 현재 필터 |
| `todoSort` | 정렬 방식 |
| `todoTheme` | 테마 |
| `todoTrash` | 되돌리기 기록 (최대 10개) |
| `todos_corrupt_backup` | 손상된 원본 데이터 백업 |

주요 한도: 할 일 최대 5,000개, 가져오기 파일 최대 5MB, 내보내기 형식 버전 `EXPORT_VERSION = 1`.

## 7. 검증 방법

헤드리스 Chrome(`C:\Program Files\Google\Chrome\Application\chrome.exe`)으로 검증한다.

- **실행 방식:**
  - `Start-Process`에 `--headless=new --dump-dom --virtual-time-budget=N --force-prefers-reduced-motion --allow-file-access-from-files`와 임시 `--user-data-dir`를 준다.
  - 출력은 `-RedirectStandardOutput`으로 받는다.
- **테스트 페이지 구성:**
  - 할 일 데이터를 미리 넣은 테스트 페이지에서 앱을 `<iframe>`으로 열고, 결과를 JSON으로 `<pre>`에 쓴다.
  - 드래그 테스트를 하려면 iframe의 `requestAnimationFrame`을 16ms `setTimeout`으로 바꿔 둔다.
- **가상 시간 모드의 특성:**
  - 렌더링 프레임이 드물게 돌아 `ResizeObserver` 호출이 늦을 수 있다. 값을 바로 읽지 말고 반영될 때까지 기다리거나, 감시 호출 횟수를 함께 확인한다.
  - 헤드리스 화면에서는 실제 화면 높이가 창 크기보다 작게 잡혀, 스크린샷 아래쪽에 빈 영역이 보일 수 있다. 실제 브라우저에서는 생기지 않는다.

| 테스트 | 기대값 |
|---|---|
| `suggestCategory` 예시 7종 | PRD 6.1 표와 같음 |
| 직접 선택 잠금과 해제 | 직접 고른 값으로 추가되고, 이후 잠금이 풀림 |
| 1440×820·1920×1080·1100×900 바 높이 | 일정함 (169px). 긴 힌트를 입력해도 같음 |
| `scrollIntoView` 후 항목 위치 | 바 아래쪽 + 7~8px |
| 바 높이 변경 | `scroll-padding-top`이 `높이 + 8px`를 따라감 |
| 드래그 | 바 아래로 끌면 위로 스크롤되고 순서가 바뀜. dragging z-index 30 > 바 20 |
| 800px 너비 | 바가 `display: contents`로 바뀌고 `scroll-padding-top`은 `auto` |
| 기본판 회귀 | 추가, 자동 분류, 필터 오류 없음 |

## 8. 배포 설계 (GitHub Pages)

| 항목 | 내용 |
|---|---|
| 호스팅 | GitHub Pages. 정적 파일만 있으므로 빌드 단계 없이 브랜치에서 바로 배포한다. |
| 저장소 | 공개 저장소 [`kjy600715-dot/mytodolist`](https://github.com/kjy600715-dot/mytodolist). 무료 플랜의 Pages는 공개 저장소에서만 쓸 수 있다. |
| 배포 소스 | `main` 브랜치의 `/` (루트) |
| URL 구조 | https://kjy600715-dot.github.io/mytodolist/ 는 기본판, https://kjy600715-dot.github.io/mytodolist/web_version/ 은 데스크톱판 |
| 경로 | 모든 리소스를 상대 경로(`style.css`, `script.js`)로 불러오므로 하위 경로에 배포해도 고칠 것이 없다. |
| Jekyll | `.nojekyll`로 끈다. 파일을 가공하지 않고 그대로 서빙하게 하기 위해서다. |
| 제외 파일 | `.gitignore`에 넣은 `conversation-*.txt`(작업 대화 기록)와 `*.png`(작업 전 스크린샷) |
| 커밋 작성자 | 개인 이메일 대신 GitHub noreply 주소(`<id>+<login>@users.noreply.github.com`)를 저장소 로컬 설정으로 쓴다. |
| 인증 | GitHub CLI(`gh auth login --web --git-protocol https`). 브라우저 로그인과 별개라 CLI에서 따로 로그인해야 한다. |

### 8.1 배포 절차

```bash
git init -b main                       # 완료
git add -A && git commit               # 로그인 후 진행
gh repo create mytodolist --public --source . --push
gh api -X POST repos/<계정>/mytodolist/pages \
  -f "source[branch]=main" -f "source[path]=/"
# 확인: gh api repos/<계정>/mytodolist/pages --jq .html_url
```

### 8.2 배포 시 유의사항

- **localStorage는 출처별로 따로 저장된다.** GitHub Pages 사이트의 데이터는 로컬(`file://`)에서 쓰던 데이터와 공유되지 않는다. 옮기려면 앱의 내보내기와 가져오기를 쓴다. 같은 사이트 안의 기본판과 데스크톱판은 출처가 같아서 데이터를 공유한다.
- 공개 저장소라 `CLAUDE.md`와 `docs/`도 누구나 볼 수 있다. 개인정보는 넣지 않는다.
- 반영 확인: push한 뒤 Pages 빌드가 끝나기까지 보통 1~2분이 걸린다. 두 URL이 모두 200을 돌려주고 화면이 보이는지 확인한다.
