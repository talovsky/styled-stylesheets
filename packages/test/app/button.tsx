import { stylesheet as css } from "styled-stylesheets";

import styles from "./button.module.css";

export const Button = () => {
  return (
    <button class={styles.btn_primary}>
      <button class={styles.btn_secondary}>hello</button>
    </button>
  );
};

const cn = css`
  .btn_secondary {
    display: block;
    padding: 2rem;
    background: #500;
  }
`;
