import { Collapse, message } from "antd";
import axios from "axios";
import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "react-query";
import { useSelector } from "react-redux";
import { useQueryState } from "../../../common/queryState";
import common from '../../../common';
import { createPortal } from 'react-dom';


const SymbolSetupModal = ({ open, onClose }) => {
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

  const [master_data_list, set_master_data_list] = useState([]);
  const [master_data_list_filtered, set_master_data_list_filtered] = useState([]);

  const [search_text, set_search_text] = useState([]);


  const [except_data_list, set_except_data_list] = useState([]);
  const [except_data_list_filtered, set_except_data_list_filtered] = useState([]);

  const [search_except_text, set_search_except_text] = useState([]);

  const get_master_data = async () => {
    const { data } = await axios.post( process.env.SERVICE + "/service/get_open_api", {
        "path" : "/stock/market-data",
        "tr_cd" : "t9945",
        "input_data" : {
            "t9945InBlock" : {
                "gubun" : "1"
            }
      },
    });

    if ( data?.response?.rsp_cd == "00000" )
    {
      let master_list = [];
      data?.response?.t9945OutBlock?.forEach(item => {
        const symbol_item = {
          is_selected: false,
          symbol: item?.shcode,
          symbol_name: item?.hname,
        };
        master_list.push(symbol_item);
      });
      set_master_data_list(master_list);
      set_master_data_list_filtered(master_list);
    } else {
      alert(data?.response?.rsp_msg);
    }
  }	  

  const get_except_data = async () => {
    const { data } = await axios.get(process.env.SERVICE + "/service/get_except");
    if ( data?.result == true )
    {
      set_except_data_list(data?.datalist);
      set_except_data_list_filtered(data?.datalist);
    } else {
      alert(data?.response?.rsp_msg);
    }
  }

  const onSelectChange = async (symbol, is_selected) => {
    let master_list = [...master_data_list];
    master_list.forEach(item => {
      if (item.symbol === symbol) {
        item.is_selected = is_selected;
      }
    });
    set_master_data_list(master_list);
  }

  const onSelectChange_except = async (symbol, is_selected) => {
    let except_list = [...except_data_list];
    except_list.forEach(item => {
      if (item.symbol === symbol) {
        item.is_selected = is_selected;
      }
    });
    set_except_data_list(except_list);
  }

  useEffect(() => {
    if (open || openKey !== null) {
      // get_master_data();
      // get_except_data();
    }
  }, [open, openKey]);

  useEffect(() => {

  }, [master_data_list, except_data_list]);

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
          width: '1300px',
          height: '750px',
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
        </div>
        
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ textAlign: 'center', marginBottom: '12px' }}>전체종목</h3>
            {/* 검색 입력창 추가 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="종목명 또는 코드로 검색"
                value={search_text}
                onChange={(e) =>  {
                  set_search_text(e.target.value);
                  let master_list = [...master_data_list];
                  master_list = master_list.filter(item => item.symbol_name.includes(e.target.value));
                  set_master_data_list_filtered(master_list);
                }}
                style={{
                  width: '80%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
            <StockkData title="전체종목" datalist={master_data_list_filtered} onSelectChange={onSelectChange} except_data_list={except_data_list} />
          </div>
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: "600px" }}>
              <button
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6b5dd3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  marginBottom: '8px'
                }}
                onClick={() => {
                  let except_list = [...except_data_list];
                  let master_list = [...master_data_list];
                  master_list.forEach(item => {
                    if (item.is_selected) {
                      if (!except_list.some(exceptItem => exceptItem.symbol === item.symbol)) {
                        const new_item = {
                          ...item,
                          is_selected: false
                        };
                        except_list.push(new_item);
                      }
                    }
                  });
                  // master_list의 모든 항목의 is_selected를 false로 변경
                  set_master_data_list(master_list);
                  set_master_data_list_filtered(master_list);
                  set_except_data_list(except_list);
                  set_except_data_list_filtered(except_list);
                }}
              >
                추가 &gt;&gt;
              </button>
              <button
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  marginTop: '8px'
                }}
                onClick={() => {
                  // TODO: 선택된 제외종목을 전체종목으로 이동하는 로직 구현
                  let old_except_list = [...except_data_list];
                  let new_except_list = [];
                  old_except_list.forEach(item => {
                    if (!item.is_selected) {
                      new_except_list.push(item);
                    }
                  });
                  set_except_data_list(new_except_list);
                }}
              >
                &lt;&lt; 삭제
              </button>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ textAlign: 'center', marginBottom: '12px' }}>제외종목</h3>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="종목명 또는 코드로 검색"
                value={search_except_text}
                onChange={(e) => {
                  set_search_except_text(e.target.value);
                  let except_list = [...except_data_list];
                  except_list = except_list.filter(item => item.symbol_name.includes(e.target.value));
                  set_except_data_list_filtered(except_list);
                }}
                style={{
                  width: '80%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
            <StockkData title="제외종목" datalist={except_data_list_filtered} onSelectChange={onSelectChange_except} />
          </div>
        </div>

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 0', textAlign: 'center', background: 'white', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px' }}>         
          
          <button
            ref={closeButtonRef}
            onClick={async () => {
              try {
                const { data } = await axios.post(process.env.SERVICE + "/service/set_except", {
                  except_data_list
                });
                if (data?.result === true) {
                  message.success("제외종목 설정 저장 완료.");
                } else {
                  message.error("제외종목 설정 저장 실패.");
                }
                onClose();
              } catch (error) {
                message.error("저장 중 오류가 발생했습니다.");
                console.error(error);
              }
            }}
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

const StockkData = ({ title, datalist, onSelectChange, except_data_list }) => {
  return (
    <>
		<div className="thbit-trade-table-container" data-simplebar style={{ height: "100%" }}>
				<table className="thbit-trade-table" >
					<thead className="sticky head">
						<tr className="notranslate" >    
							<th className="align-c" style={{ fontSize: "13px", fontWeight: "600", width: "70px" }}>
								순번
							</th>  
							<th className="align-c" style={{ fontSize: "13px", fontWeight: "600", width: "50px" }}>
								선택
							</th>  
							<th className="align-c" style={{ fontSize: "13px", fontWeight: "600", width: "70px" }}>
								종목코드
							</th>        
              <th className="align-c" style={{ fontSize: "13px", fontWeight: "600" }}>
								종목명
							</th>                
						</tr>
					</thead>
					<tbody>
						<StockDataBody datalist={datalist} onSelectChange={onSelectChange} except_data_list={except_data_list} />
					</tbody>
				</table>
			</div>  
    </>
  );
};

const StockDataBody = (props) => {
  return props?.datalist?.map((item, index) => (
    <StockDataItem key={`${item.symbol}-${index}`} index={index} {...item} props={props} />
  ));
};

export const StockDataItem = ({
  is_selected,
  index,
  symbol,
  symbol_name,
  props
}) => {
  return (
		<tr style={{ cursor: "pointer" }}
      onClick={() => {
        navigator.clipboard.writeText(symbol);
     }}>
      <td className="align-c" style={{ fontSize: "13px", fontWeight: "500" }}>{index + 1}</td>
      <td className="align-c" style={{ fontSize: "13px", fontWeight: "500" }}>
        <input
          checked={is_selected || props?.except_data_list?.some(item => item.symbol === symbol)}
          type="checkbox"
          style={{ marginRight: "5px" }}
          onChange={(e) => {
            e.stopPropagation();
            if (props.onSelectChange) {
              props.onSelectChange(symbol, e.target.checked);
            }
          }}
        />
      </td>

      <td className="align-c" style={{ fontSize: "13px", fontWeight: "500" }}>{symbol}</td>
      <td
        className="align-c"
        title={symbol}
        style={{ fontSize: "13px", fontWeight: "500" }}
      >
        {symbol_name}
      </td>
		</tr>
	);
};

export default SymbolSetupModal;
