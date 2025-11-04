import { Collapse } from "antd";
import axios from "axios";
import React, { useEffect, useRef } from "react";
import { useQuery } from "react-query";
import { useSelector } from "react-redux";
import { useQueryState } from "../../../common/queryState";
import common from '../../../common';
import { createPortal } from 'react-dom';


const NoticeModal = ({ open, onClose }) => {
  const [openKey] = useQueryState("open", null, []);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  // aria-hidden 요소들을 동적으로 제어
  useEffect(() => {
    if (open || openKey !== null) {
      // 현재 포커스된 요소 저장
      previousFocusRef.current = document.activeElement;
      
      // aria-hidden="true" 요소들의 포커스 방지
      const ariaHiddenElements = document.querySelectorAll('[aria-hidden="true"]');
      ariaHiddenElements.forEach(element => {
        element.style.pointerEvents = 'none';
        element.setAttribute('tabindex', '-1');
        
        // 하위 요소들도 비활성화
        const focusableElements = element.querySelectorAll('button, input, select, textarea, a, [tabindex]');
        focusableElements.forEach(focusable => {
          focusable.style.pointerEvents = 'none';
          focusable.setAttribute('tabindex', '-1');
        });
      });
      
      // Modal이 열릴 때 포커스를 닫기 버튼으로 이동
      setTimeout(() => {
        if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        }
      }, 100);
      
      // body에 no-scroll 클래스 추가
      document.body.classList.add('modal-open');
    } else {
      // Modal이 닫힐 때 no-scroll 클래스 제거
      document.body.classList.remove('modal-open');
      
      // aria-hidden 요소들 복원
      const ariaHiddenElements = document.querySelectorAll('[aria-hidden="true"]');
      ariaHiddenElements.forEach(element => {
        element.style.pointerEvents = '';
        element.removeAttribute('tabindex');
        
        // 하위 요소들도 복원
        const focusableElements = element.querySelectorAll('button, input, select, textarea, a, [tabindex="-1"]');
        focusableElements.forEach(focusable => {
          focusable.style.pointerEvents = '';
          focusable.removeAttribute('tabindex');
        });
      });
      
      // 이전 포커스로 복원
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    }

    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [open, openKey]);

  // ESC 키 처리
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && (open || openKey !== null)) {
        onClose();
      }
    };

    if (open || openKey !== null) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, openKey, onClose]);

  // 포커스 트랩
  useEffect(() => {
    if (open || openKey !== null) {
      const handleFocusTrap = (e) => {
        const modalElement = modalRef.current;
        if (modalElement && !modalElement.contains(e.target)) {
          // Modal 외부로 포커스가 이동하려고 할 때 Modal 내부로 다시 포커스 이동
          if (closeButtonRef.current) {
            closeButtonRef.current.focus();
          }
        }
      };

      document.addEventListener('focusin', handleFocusTrap);
      return () => {
        document.removeEventListener('focusin', handleFocusTrap);
      };
    }
  }, [open, openKey]);

  // Modal이 열려있지 않으면 렌더링하지 않음
  if (!open && openKey === null) {
    return null;
  }

  // Portal을 사용하여 body에 직접 렌더링
  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="modal-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
        }}
      />
      
      {/* Modal */}
      <div 
        ref={modalRef}
        className="custom-notice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-modal-title"
        aria-describedby="notice-modal-description"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: '10px',
          padding: '20px',
          width: '800px',
          height: '900px',
          overflow: 'auto',
          zIndex: 1001,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* X 닫기 버튼 */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '15px',
            right: '15px',
            width: '30px',
            height: '30px',
            backgroundColor: 'transparent',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            borderRadius: '50%',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#f0f0f0';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'transparent';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClose();
            }
          }}
          aria-label="모달 닫기"
        >
          ✕
        </button>

        <div className="modal-head">
          <h2 id="notice-modal-title" className="title" style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 'bold' }}>
          제외종목설정
          </h2>
          <div id="notice-modal-description" className="sr-only">
            공지사항을 확인하고 닫을 수 있습니다.
          </div>
        </div>
        
        {/* <div className="thbit-notice-list thbit-scroll-content">
          <Collapse className="notice-list cust-scrollbar" defaultActiveKey={[openKey]}>
            {(data?.datalist ?? []).map((item) => (
              <Panel showArrow={false} header={<h2 className="list-title">{common.convertDateOnly(item.time) + " " + item.title}</h2>} key={item.key}>
                {item.body}
              </Panel>
            ))}
          </Collapse>
        </div> */}

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 0', textAlign: 'center', background: 'white', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px' }}>         
          
          <button
            ref={closeButtonRef}
            // onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6b5dd3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            저장
          </button>      
          <span style={{ display: 'inline-block', width: '10px' }}></span>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6b5dd3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClose();
              }
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

export default NoticeModal;
