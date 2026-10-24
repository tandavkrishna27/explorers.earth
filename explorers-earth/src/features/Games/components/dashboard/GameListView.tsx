import { useParams } from "react-router-dom";
import ListPage from "../../../shared/list/ListPage";
import { useGamesListAdapter } from "../../../shared/list/adapters/games";

const GameListView = () => {
  const { listId } = useParams();
  return <ListPage adapter={useGamesListAdapter(listId!)} />;
};
export default GameListView;
