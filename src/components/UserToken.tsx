import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUsers } from "../api/users";
import type { User } from "../api/users/types";

interface IProps {
  id: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}
const UserToken = ({ id, className = "", disabled, loading }: IProps) => {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(["users"], getUsers, {
    enabled: true,
    staleTime: 50000,
  });

  function getUser(users: User[] | undefined) {
    if (!users) return;
    const newUser = users.find((i) => i._id === id);
    return newUser;
  }

  const user = useMemo(() => getUser(data), [data, id]);

  function onUserClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    navigate("/settings/user/" + user?._id);
  }
  const preferredName = user?.displayName || user?.username;
  if (isLoading || loading)
    return (
      <span className='h-[1em] w-12 rounded-lg bg-slate-200 animate-pulse inline-block'></span>
    );

  if (!user)
    return (
      <span className={`font-medium italic ${className}`}>
        {"[Deleted User]"}
      </span>
    );
  if (disabled) return <span className={`${className}`}> {preferredName}</span>;
  return (
    <button
      onClick={onUserClick}
      type='button'
      title={`open ${preferredName}'s profile`}
      className={`text-blue-600 hover:underline hover:bg-slate-200 ${className}`}
    >
      {preferredName}
    </button>
  );
};

export default UserToken;
