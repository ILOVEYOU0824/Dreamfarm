-- students 테이블에 group_name 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

-- 1. 컬럼이 이미 존재하는지 확인하고 없으면 추가
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'students' 
        AND column_name = 'group_name'
    ) THEN
        ALTER TABLE students 
        ADD COLUMN group_name TEXT;
        
        RAISE NOTICE 'group_name 컬럼이 성공적으로 추가되었습니다.';
    ELSE
        RAISE NOTICE 'group_name 컬럼이 이미 존재합니다.';
    END IF;
END $$;

-- 2. 컬럼 추가 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'students' 
AND column_name = 'group_name';

