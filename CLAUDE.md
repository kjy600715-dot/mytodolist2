# CLAUDE.md — My Tasks 개발 가이드

설치·서버 없이 `index.html`을 브라우저로 열어 쓰는 할 일 앱. 요구사항은 `docs/PRD.md`, 설계는 `docs/TRD.md`, 작업 목록은 `docs/TASK.md`.

## 구조

| 경로 | 내용 |
|---|---|
| `index.html` / `style.css` / `script.js` | 기본판 (모바일·한 열, 600px 카드) |
| `web_version/index.html` | 데스크톱판. 기본판과 **같은 요소·id**를 `.sidebar` / `.workspace` / `.workspace-top`으로 감쌈 |
| `web_version/style.css` | 기본판 스타일 전체 + 끝의 `13. 데스크톱 레이아웃` 섹션 |
| `web_version/script.js` | **기본판 `script.js`와 내용이 같음** |
| `.nojekyll`, `.gitignore` | GitHub Pages 배포용 |

## 반드시 지킬 규칙

- **`script.js`를 고치면 `web_version/script.js`도 똑같이 고친다.** (확인: `cmp script.js web_version/script.js`)
- 기본판 `style.css`를 고치면 `web_version/style.css`의 같은 부분도 고친다. 데스크톱 전용 규칙은 `13.` 섹션에만 넣는다.
- 마크업 id를 바꾸면 `script.js`의 `dom` 객체도 함께 바꾼다. 두 `index.html`의 id는 같아야 한다.
- 의존성·빌드 도구·CDN 금지. 순수 HTML/CSS/JS.
- 사용자 텍스트는 `textContent`(또는 텍스트 노드)로만 넣는다. `innerHTML` 금지.
- 색은 모두 CSS 변수로 지정하고, `:root`와 `:root[data-theme="dark"]` 양쪽에 정의한다.
- localStorage 접근은 `storage` 래퍼로만 한다. 외부 데이터(저장소, 가져오기)는 `sanitizeTodos()`를 거친다.
- 단축키는 `e.code` 기준(한글 입력기·자판 배열 무관). 새 단축키는 HTML의 단축키 안내에도 추가한다.

## script.js 섹션

1 상수 → 2 유틸리티 → 3 저장소 → 4 검증 → 5 상태 → 6 변경 → 7 렌더링 → 8 이벤트 → 9 초기화. 새 코드는 맞는 섹션에 넣는다.

- 상태가 바뀌면 `commit()` = 저장 예약(300ms 디바운스) + `render()`.
- `reconcileList()`는 id별로 요소를 캐시하고 `signatureOf()`가 바뀐 항목만 다시 그린다. 항목 표시 내용을 추가하면 서명에도 넣는다.
- `todos` 배열 순서가 곧 "직접 정렬" 순서다. 새 항목은 맨 앞(`unshift`)에 들어간다.

## 자동 카테고리 분류

- 키워드는 `CATEGORY_KEYWORDS` 한 곳에서 관리한다. **소문자, 두 글자 이상**만 넣는다.
- `suggestCategory()`: 부분 일치(`includes`) 개수가 가장 많은 카테고리. 동점·일치 없음 → `null`.
- 새 할 일 입력 폼에만 적용한다. 인라인 수정·가져오기에는 적용하지 않는다.
- 입력 중 사용자가 카테고리를 직접 고르면 `categoryLocked = true` → 입력을 비우거나 추가할 때까지 자동 분류 정지. 추가 후에는 `manualCategory`(마지막 직접 선택)로 돌아간다.

### 카테고리를 새로 추가할 때 바꿀 곳

- JS: `CATEGORIES`, `CATEGORY_ORDER`, `CATEGORY_KEYWORDS`, `SHORTCUT_FILTERS`
- HTML(두 파일 모두): `<option>`, 필터 버튼, `.cat-stat` 카드, 단축키 안내
- CSS(두 파일 모두): `--color-*` 변수(라이트·다크), `[data-category]` 규칙, 데스크톱 `.filter-btn[data-filter]` 점 색

## 데스크톱판 고정 바

- 1024px 이상: 2단 그리드, 사이드바 `sticky`, `.workspace-top` `sticky; z-index: 20`.
- `html { scroll-padding-top: var(--top-bar-space) }`로 스크롤·포커스 이동한 항목이 바에 가리지 않게 한다.
- `--top-bar-space`는 `observeTopBar()`의 `ResizeObserver`가 **바 높이 + 8px**로 자동 갱신한다. CSS의 176px은 초기값일 뿐이니 직접 맞추지 않는다. 기본판에는 `.workspace-top`이 없어서(`dom.topBar === null`) 감시 코드가 돌지 않는다.
- 드래그 중 항목은 `z-index: 30`. 자동 스크롤 위쪽 기준선은 `drag.topInset`(= scroll-padding-top) + 64px.
- 1024px 미만에서는 감싸는 요소를 `display: contents`로 풀고 `order`로 기본판 순서를 되살린다.
- `var()`가 들어간 `padding` 단축 속성은 피하고 개별 속성(`padding-inline` 등)으로 쓴다.

## 검증 (Node.js 없음 → 헤드리스 Chrome)

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList `
  "--headless=new","--dump-dom","--virtual-time-budget=60000","--force-prefers-reduced-motion", `
  "--allow-file-access-from-files","--user-data-dir=<임시폴더>","file:///<테스트페이지>.html" `
  -RedirectStandardOutput out.html -Wait -NoNewWindow
```

- 테스트 페이지에서 localStorage에 데이터를 넣고 앱을 `<iframe>`으로 연 뒤, 결과를 JSON으로 `<pre>`에 쓴다.
- `todos`, `filter` 같은 최상위 `let` 변수는 `window` 속성이 아니다 → `iframe.contentWindow.eval('todos')`로 읽는다. 함수(`suggestCategory`, `render`)는 `window`에서 바로 접근할 수 있다.
- 드래그 테스트 전에는 iframe의 `requestAnimationFrame`을 16ms `setTimeout`으로 바꾼다.
- 가상 시간 모드에서는 `ResizeObserver` 호출이 늦을 수 있으니 기다린 뒤 값을 읽는다.
