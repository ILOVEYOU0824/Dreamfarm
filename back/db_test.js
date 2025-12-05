// db_test.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testDB() {
  const { data, error } = await supabase
    .from('user_profiles')   // 테이블명 입력
    .select('*')
    .limit(5);

  if (error) {
    console.error('쿼리 에러:', error);
  } else {
    console.log('조회 결과:', data);
  }
}

testDB();
