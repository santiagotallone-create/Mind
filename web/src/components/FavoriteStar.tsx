import { t } from "../i18n";
import { Icon } from "./Icon";
import styles from "./ui.module.css";

type Props = { favorite: boolean; onToggle: () => void };

export function FavoriteStar({ favorite, onToggle }: Props) {
  return (
    <button type="button" className={styles.star} aria-pressed={favorite} aria-label={t(favorite ? "player.removeFavorite" : "player.addFavorite")} onClick={onToggle}>
      <Icon name="star" filled={favorite} />
    </button>
  );
}
