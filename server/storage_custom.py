
# --- 커스텀 과제 CRUD ---

# 입력: student_id (학번), assignment_data (딕셔너리)
# 기능: 커스텀 과제를 DB에 저장하거나 수정
# 반환: 저장된 과제의 ID
def save_custom_assignment(student_id, assignment_data):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                if assignment_data.get('id') and str(assignment_data['id']).isdigit():
                    # 수정
                    sql = """
                    UPDATE custom_assignments 
                    SET course_name = %s, assignment_name = %s, due_date = %s, is_submitted = %s, description = %s
                    WHERE id = %s AND student_id = %s
                    RETURNING id;
                    """
                    cur.execute(sql, (
                        assignment_data['subject'],
                        assignment_data['task'],
                        assignment_data['deadline'],
                        assignment_data.get('isSubmitted', False),
                        assignment_data.get('description', ''),
                        assignment_data['id'],
                        student_id
                    ))
                else:
                    # 신규 추가
                    sql = """
                    INSERT INTO custom_assignments (student_id, course_name, assignment_name, due_date, is_submitted, description)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id;
                    """
                    cur.execute(sql, (
                        student_id,
                        assignment_data['subject'],
                        assignment_data['task'],
                        assignment_data['deadline'],
                        assignment_data.get('isSubmitted', False),
                        assignment_data.get('description', '')
                    ))
                
                result = cur.fetchone()
                conn.commit()
                return result[0] if result else None
        except Exception as e:
            conn.rollback()
            logger.error(f"커스텀 과제 저장 중 오류 발생 (student_id: {student_id}): {e}")
            raise

# 입력: student_id (학번)
# 기능: 해당 사용자의 모든 커스텀 과제 조회
# 반환: 과제 리스트
def get_custom_assignments(student_id):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "SELECT id, course_name, assignment_name, due_date, is_submitted, description FROM custom_assignments WHERE student_id = %s ORDER BY created_at DESC;"
                cur.execute(sql, (student_id,))
                rows = cur.fetchall()
                
                assignments = []
                for row in rows:
                    assignments.append({
                        "id": str(row[0]),
                        "subject": row[1],
                        "task": row[2],
                        "deadline": row[3],
                        "isSubmitted": row[4],
                        "description": row[5],
                        "source": "user"
                    })
                return assignments
        except Exception as e:
            logger.error(f"커스텀 과제 조회 중 오류 발생 (student_id: {student_id}): {e}")
            raise

# 입력: student_id (학번), assignment_id (과제 ID)
# 기능: 특정 커스텀 과제 삭제
# 반환: 성공 여부
def delete_custom_assignment(student_id, assignment_id):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "DELETE FROM custom_assignments WHERE id = %s AND student_id = %s;"
                cur.execute(sql, (assignment_id, student_id))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"커스텀 과제 삭제 중 오류 발생 (id: {assignment_id}): {e}")
            raise
