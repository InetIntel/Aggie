interface IProps {
  errorStatus: Number;
  errorData: string;
}

const ErrorCard = (props: IProps) => {
  return (
    <div className='px-4 py-2 border border-slate-300 bg-white w-full'>
      <h1 className={"text-xl font-medium mb-2"}>{props.errorStatus} Error</h1>
      <p>
        Please contact your system administrator with the error code below.{" "}
      </p>
      <small>
        {props.errorStatus}: {props.errorData}
      </small>
    </div>
  );
};

export default ErrorCard;
