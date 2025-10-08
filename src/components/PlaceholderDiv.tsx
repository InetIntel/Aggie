interface IProps extends React.ButtonHTMLAttributes<HTMLDivElement> {
  loading?: boolean;
  width?: string;
  loadingClass?: string;
  as?: React.ElementType;
}

const PlaceholderDiv = ({
  as = "div",
  loading = false,
  width = "50%",
  loadingClass = "bg-slate-200 dark:bg-gray-600 rounded-lg ",
  ...props
}: IProps) => {
  const Element = as;
  if (loading)
    return (
      <Element className={`${props.className}`}>
        <span
          className={`h-[1em] inline-block animate-pulse ${loadingClass}`}
          style={{ width: width }}
        ></span>
      </Element>
    );
  return <Element {...props} />;
};

export default PlaceholderDiv;
