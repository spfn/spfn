# Figma to Next.js Component

현재 Figma Desktop에서 선택된 노드를 Next.js 컴포넌트로 변환합니다.

## 실행 단계

1. **Figma 디자인 가져오기**
   - `mcp__figma-desktop__get_design_context` 도구로 선택된 노드의 코드 가져오기
   - `mcp__figma-desktop__get_screenshot` 도구로 스크린샷 가져오기

2. **이미지 에셋 다운로드**
   - 코드에서 `localhost:3845/assets/` URL 추출
   - 각 이미지를 프로젝트의 `public/images/figma/` 폴더에 다운로드
   - 파일명은 Figma 노드 이름 기반으로 생성 (예: `survey-hero.png`)

3. **Next.js 컴포넌트 생성**
   - Tailwind CSS 사용
   - `next/image` 컴포넌트로 이미지 처리
   - 컴포넌트명은 Figma 프레임 이름 기반
   - TypeScript 사용
   - Allman 스타일 브레이스 적용

4. **출력**
   - 생성된 컴포넌트 코드 표시
   - 다운로드된 이미지 목록 표시
   - 사용법 안내

## 옵션

인자가 있으면 해당 경로에 컴포넌트 파일 생성:
- `/figma` - 코드만 출력
- `/figma components/Survey.tsx` - 파일로 저장

## 주의사항

- Figma Desktop이 실행 중이어야 함
- Dev Mode에서 노드가 선택되어 있어야 함
- MCP 서버가 활성화되어 있어야 함
