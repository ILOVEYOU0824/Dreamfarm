# GitHub에 코드 올리기 가이드

## 1단계: GitHub 저장소 만들기

1. https://github.com 접속
2. 로그인 (ILOVEYOU0824)
3. 우측 상단 "+" 버튼 클릭 → "New repository"
4. 저장소 정보 입력:
   - **Repository name**: `my-project` (원하는 이름)
   - **Description**: (선택사항)
   - **Public** 또는 **Private** 선택
   - ⚠️ **"Initialize this repository with a README" 체크 해제**
5. "Create repository" 클릭

## 2단계: 로컬 저장소와 연결

GitHub에서 제공하는 명령어를 복사하거나, 아래 명령어를 사용하세요:

```bash
# 저장소 이름이 "my-project"인 경우
git remote add origin https://github.com/ILOVEYOU0824/my-project.git
git branch -M main
git push -u origin main
```

## 3단계: 코드 푸시

터미널에서 다음 명령어 실행:

```bash
git add .
git commit -m "Initial commit"
git push -u origin main
```

---

## 빠른 명령어 (한 번에 실행)

저장소를 만든 후 아래 명령어를 순서대로 실행하세요:

```bash
# 1. 원격 저장소 연결 (저장소 이름을 실제 이름으로 변경)
git remote add origin https://github.com/ILOVEYYOU0824/저장소이름.git

# 2. 브랜치 이름을 main으로 변경
git branch -M main

# 3. GitHub에 푸시
git push -u origin main
```

---

## 완료 후

GitHub에 코드가 올라갔으면:
1. Render에서 저장소 연결
2. Netlify에서 저장소 연결
3. 배포 진행!

