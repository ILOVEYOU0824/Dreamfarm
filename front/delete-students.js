// Supabase에서 학생 일괄 삭제 스크립트
// 사용법: node delete-students.js
// 주의: 백엔드 서버가 실행 중이어야 합니다 (http://localhost:3000)

const studentsToDelete = ['지수', '배짱', '홍길동', '다빈', '하람', '하민', '라온', '소이', '개발자', '철수'];

async function deleteStudents() {
  try {
    // node-fetch를 사용하거나, Node.js 18+에서는 내장 fetch 사용
    const fetch = (await import('node-fetch')).default || globalThis.fetch;
    
    const response = await fetch('http://localhost:3000/api/students/bulk', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ names: studentsToDelete }),
    });

    const result = await response.json();
    console.log('삭제 결과:', result);
    
    if (result.deleted > 0) {
      console.log(`✅ ${result.deleted}명의 학생이 삭제되었습니다.`);
      if (result.deletedNames) {
        console.log('삭제된 학생:', result.deletedNames.join(', '));
      }
    }
    
    if (result.notFound && result.notFound.length > 0) {
      console.log('⚠️ 찾을 수 없는 학생:', result.notFound.join(', '));
    }
  } catch (error) {
    console.error('❌ 삭제 실패:', error.message);
    console.error('백엔드 서버가 실행 중인지 확인하세요: http://localhost:3000');
  }
}

deleteStudents();
