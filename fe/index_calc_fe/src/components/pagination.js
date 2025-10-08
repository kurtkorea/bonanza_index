import classNames from 'classnames';
import React from 'react';

const BifyPagination = ({ total, size, onClick, page, isLoading }) => {
  if (isLoading) {
    return <div>...</div>;
  }

  const lastPage = Math.ceil(total / size);
  const pageArr = [];

  console.log(lastPage);

  for (let i = page - 2; pageArr.length < 5 && lastPage >= i; i++) {
    if (i > 0) {
      pageArr.push(i);
    }
  }

  const goFirstPage = () => {
    if (page !== 1) {
      onClick(1);
    }
  };

  const goPrevPage = () => {
    if (page > 2) {
      onClick(page - 1);
    }
  };

  const goNextPage = () => {
    if (page < lastPage) {
      onClick(page + 1);
    }
  };

  const goLastPage = () => {
    if (page < lastPage) {
      onClick(lastPage);
    }
  };

  const goPageNum = pageNum => {
    if (page !== pageNum) {
      onClick(pageNum);
    }
  };

  return (
    <div className="thbit-paging">
      <a onClick={goFirstPage} className="pa start">
        &lt;&lt;
      </a>
      <a onClick={goPrevPage} className="pa prev">
        &lt;
      </a>
      {pageArr.map(pageNum => (
        <a
          className={classNames('pg', { on: pageNum === page })}
          key={`pg-num-${pageNum}`}
          onClick={() => goPageNum(pageNum)}
        >
          {pageNum}
        </a>
      ))}
      <a onClick={goNextPage} className="pa next">
        &gt;
      </a>
      <a onClick={goLastPage} className="pa end">
        &gt;&gt;
      </a>
    </div>
  );
};

export default BifyPagination;
